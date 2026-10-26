
'use strict';

const { isIP } = require('node:net');
const db = require('../db');

const DEFAULT_OPTIONS = {
  windowMs: 5 * 60 * 1000,
  threshold: 10,
  cooldownMs: 5 * 60 * 1000,
  maxTrackedIps: 1000,
  maxEventsPerIp: 256
};

const SELECT_STATE = `
  SELECT failure_timestamps_ms,
         last_seen_ms,
         last_alert_at_ms,
         truncated_until_ms
  FROM security_brute_force_state
  WHERE source_ip = $1::inet
  FOR UPDATE
`;

function validateConfig(config) {
  const {
    windowMs, threshold, cooldownMs,
    maxTrackedIps, maxEventsPerIp
  } = config;

  const values = [
    windowMs, threshold, cooldownMs,
    maxTrackedIps, maxEventsPerIp
  ];

  if (
    !values.every(Number.isSafeInteger) ||
    values.some(value => value <= 0) ||
    threshold > maxEventsPerIp ||
    maxTrackedIps * maxEventsPerIp > 300000 ||
    maxEventsPerIp > 256
  ) {
    throw new Error('Invalid shared detector configuration');
  }
}

function normalizeSourceIp(sourceIp) {
  if (typeof sourceIp !== 'string' || isIP(sourceIp) === 0) {
    return null;
  }

  if (
    sourceIp.startsWith('::ffff:') &&
    isIP(sourceIp.slice(7)) === 4
  ) {
    return sourceIp.slice(7);
  }

  return sourceIp;
}

function validateTimestamp(now) {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    now > 8640000000000000
  ) {
    throw new Error('Invalid observation timestamp');
  }
}

async function findLockedState(client, ip) {
  const result = await client.query(SELECT_STATE, [ip]);
  return result.rows[0] || null;
}

async function createStateIfMissing(client, ip, now, config) {
  // Serialize creation of new IP records.
  await client.query(
    'SELECT pg_advisory_xact_lock(6920, 1)'
  );

  // Recheck after obtaining the advisory lock.
  const existing = await findLockedState(client, ip);

  if (existing) {
    return existing;
  }

  await client.query(
    `DELETE FROM security_brute_force_state
     WHERE last_seen_ms <= $1`,
    [now - config.windowMs - config.cooldownMs]
  );

  const capacity = await client.query(
    `SELECT COUNT(*)::integer AS total
     FROM security_brute_force_state`
  );

  if (capacity.rows[0].total >= config.maxTrackedIps) {
    return null;
  }

  await client.query(
    `INSERT INTO security_brute_force_state
       (source_ip, last_seen_ms)
     VALUES ($1::inet, $2)`,
    [ip, now]
  );

  return findLockedState(client, ip);
}

async function getOrCreateLockedState(client, ip, now, config) {
  const existing = await findLockedState(client, ip);

  if (existing) {
    return existing;
  }

  return createStateIfMissing(client, ip, now, config);
}

function calculateNextState(state, now, config) {
  // Use the latest observation as the time watermark.
  // Late observations must not move time backwards.
  const effectiveNow = Math.max(
    now,
    Number(state.last_seen_ms)
  );

  const cutoff = effectiveNow - config.windowMs;

  // Include late observations still inside the window.
  // Keep timestamps ordered for correct truncation.
  const timestamps = [
    ...state.failure_timestamps_ms.map(Number),
    now
  ]
    .filter(time => time > cutoff)
    .sort((a, b) => a - b);

  let truncatedUntil =
    state.truncated_until_ms === null
      ? null
      : Number(state.truncated_until_ms);

  if (
    truncatedUntil !== null &&
    effectiveNow >= truncatedUntil
  ) {
    truncatedUntil = null;
  }

  if (timestamps.length > config.maxEventsPerIp) {
    timestamps.splice(
      0,
      timestamps.length - config.maxEventsPerIp
    );

    truncatedUntil = effectiveNow + config.windowMs;
  }

  const lastAlert =
    state.last_alert_at_ms === null
      ? null
      : Number(state.last_alert_at_ms);

  const shouldAlert =
    timestamps.length >= config.threshold &&
    (
      lastAlert === null ||
      effectiveNow - lastAlert >= config.cooldownMs
    );

  return {
    timestamps,
    lastSeenAt: effectiveNow,
    lastAlertAt: shouldAlert ? effectiveNow : lastAlert,
    truncatedUntil,
    shouldAlert
  };
}

async function saveState(client, ip, now, nextState) {
  await client.query(
    `UPDATE security_brute_force_state
     SET failure_timestamps_ms = $2::bigint[],
         last_seen_ms = $3,
         last_alert_at_ms = $4,
         truncated_until_ms = $5
     WHERE source_ip = $1::inet`,
    [
      ip,
      nextState.timestamps,
      now,
      nextState.lastAlertAt,
      nextState.truncatedUntil
    ]
  );
}

function buildDetection(ip, now, nextState, config) {
  return {
    type: 'possible_brute_force',
    sourceIp: ip,
    failedAttempts: nextState.timestamps.length,
    countTruncated:
      nextState.truncatedUntil !== null &&
      now < nextState.truncatedUntil,
    windowSeconds: config.windowMs / 1000,
    detectedAt: new Date(now).toISOString()
  };
}

async function withTransaction(callback) {
  const client = await db.getClient();
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;

    // Bound database lock waiting for security monitoring.
    await client.query("SET LOCAL lock_timeout = '1500ms'");

    // Bound individual SQL statement execution.
    await client.query("SET LOCAL statement_timeout = '3000ms'");

    const result = await callback(client);

    await client.query('COMMIT');
    transactionOpen = false;

    return result;
  } catch (error) {
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => {});
    }

    throw error;
  } finally {
    client.release();
  }
}

function createSharedBruteForceDetector(options = {}) {
  const config = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  validateConfig(config);

  async function recordFailedLogin(sourceIp, now = Date.now()) {
    const ip = normalizeSourceIp(sourceIp);

    if (ip === null) {
      return null;
    }

    validateTimestamp(now);

    return withTransaction(async client => {
      const state = await getOrCreateLockedState(
        client, ip, now, config
      );

      if (state === null) {
        return null;
      }

      const nextState = calculateNextState(
        state, now, config
      );

      await saveState(
        client, ip, nextState.lastSeenAt, nextState
      );

      return nextState.shouldAlert
        ? buildDetection(
            ip, nextState.lastSeenAt, nextState, config
          )
        : null;
    });
  }

  return { recordFailedLogin };
}

module.exports = { createSharedBruteForceDetector };


'use strict';

const { isIP } = require('node:net');

function createBruteForceDetector(options = {}) {
  const {
    windowMs = 5 * 60 * 1000,
    threshold = 10,
    cooldownMs = 5 * 60 * 1000,
    bucketMs = 10 * 1000, // Legacy option for existing tests.
    maxTrackedIps = 1000,
    maxEventsPerIp = 256
  } = options;

  const values = [
    windowMs,
    threshold,
    cooldownMs,
    bucketMs,
    maxTrackedIps,
    maxEventsPerIp
  ];

  if (
    !values.every(Number.isSafeInteger) ||
    values.some((value) => value <= 0) ||
    windowMs % bucketMs !== 0 ||
    threshold > maxEventsPerIp ||
    maxTrackedIps * maxEventsPerIp > 300000
  ) {
    throw new Error('Invalid security detector configuration');
  }

  const sources = new Map();

  let capacityDrops = 0;
  let invalidSources = 0;
  let eventTruncations = 0;

  function cleanup(now) {
    const expirationMs = windowMs + cooldownMs;

    for (const [ip, entry] of sources) {
      if (now - entry.lastSeen >= expirationMs) {
        sources.delete(ip);
      }
    }
  }

  function normalizeSourceIp(sourceIp) {
    if (typeof sourceIp !== 'string' || isIP(sourceIp) === 0) {
      invalidSources++;
      return null;
    }

    return sourceIp.startsWith('::ffff:') &&
      isIP(sourceIp.slice(7)) === 4
      ? sourceIp.slice(7)
      : sourceIp;
  }

  function recordFailedLogin(sourceIp, now = Date.now()) {
    const ip = normalizeSourceIp(sourceIp);
    if (ip === null) {
      return null;
    }

    if (
      !Number.isSafeInteger(now) ||
      now < 0 ||
      now > 8640000000000000
    ) {
      throw new Error('Invalid observation timestamp');
    }

    let entry = sources.get(ip);

    if (entry && now < entry.lastSeen) {
      throw new Error(
        'Observation timestamps must be ordered'
      );
    }

    if (!entry) {
      if (sources.size >= maxTrackedIps) {
        cleanup(now);
      }

      if (sources.size >= maxTrackedIps) {
        capacityDrops++;
        return null;
      }

      entry = {
        timestamps: [],
        lastSeen: now,
        lastAlertAt: -Infinity,
        truncatedUntil: -Infinity
      };

      sources.set(ip, entry);
    }

    // Exact sliding window: (now - windowMs, now].
    const cutoff = now - windowMs;

    while (
      entry.timestamps.length > 0 &&
      entry.timestamps[0] <= cutoff
    ) {
      entry.timestamps.shift();
    }

    // Record the exact timestamp of this failure.
    entry.timestamps.push(now);

    // Bound per-IP memory.
    if (entry.timestamps.length > maxEventsPerIp) {
      entry.timestamps.shift();
      eventTruncations++;

      // Counts may be incomplete until the dropped
      // observation is definitely outside the window.
      entry.truncatedUntil = now + windowMs;
    }

    entry.lastSeen = now;

    const attempts = entry.timestamps.length;

    if (
      attempts >= threshold &&
      now - entry.lastAlertAt >= cooldownMs
    ) {
      entry.lastAlertAt = now;

      return {
        type: 'possible_brute_force',
        sourceIp: ip,
        failedAttempts: attempts,
        countTruncated: now < entry.truncatedUntil,
        windowSeconds: windowMs / 1000,
        detectedAt: new Date(now).toISOString()
      };
    }

    return null;
  }

  function getStats() {
    return {
      trackedIps: sources.size,
      capacityDrops,
      invalidSources,
      eventTruncations
    };
  }

  return {
    recordFailedLogin,
    getStats
  };
}

module.exports = {
  createBruteForceDetector
};

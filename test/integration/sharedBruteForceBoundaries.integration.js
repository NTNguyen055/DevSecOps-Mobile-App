'use strict';

const { assert } = require('chai');
const { URL } = require('node:url');
const db = require('../../db');

const {
  createSharedBruteForceDetector
} = require('../../middleware/sharedBruteForceDetector');

describe('Shared Brute Force Window and Cooldown', function () {
  this.timeout(30000);

  const windowIp = '198.51.100.213';
  const truncationIp = '198.51.100.214';

  before(() => {
    const url = new URL(process.env.DATABASE_URL || '');

    if (
      process.env.NODE_ENV !== 'test' ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '55432' ||
      url.pathname !== '/lb_test_db' ||
      url.username !== 'lb_test'
    ) {
      throw new Error('Isolated local test database required');
    }
  });

  async function cleanup() {
    await db.query(
      `DELETE FROM security_brute_force_state
       WHERE source_ip IN ($1::inet, $2::inet)`,
      [windowIp, truncationIp]
    );
  }

  beforeEach(cleanup);
  afterEach(cleanup);

  it('honors sliding window boundaries and shared cooldown',
    async () => {
      const config = {
        windowMs: 20000,
        threshold: 3,
        cooldownMs: 10000,
        maxTrackedIps: 100,
        maxEventsPerIp: 10
      };

      const detectorA = createSharedBruteForceDetector(config);
      const detectorB = createSharedBruteForceDetector(config);

      const base = Date.now() - 60000;

      assert.isNull(
        await detectorA.recordFailedLogin(windowIp, base + 10000)
      );

      assert.isNull(
        await detectorB.recordFailedLogin(windowIp, base + 14000)
      );

      // First observation is exactly at the expired boundary.
      assert.isNull(
        await detectorA.recordFailedLogin(windowIp, base + 30000)
      );

      const first = await detectorB.recordFailedLogin(
        windowIp,
        base + 30001
      );

      assert.isNotNull(first);
      assert.equal(first.failedAttempts, 3);

      // Another replica must respect the shared cooldown.
      assert.isNull(
        await detectorA.recordFailedLogin(windowIp, base + 30002)
      );

      // Exactly 10 seconds after the first detection.
      const repeated = await detectorB.recordFailedLogin(
        windowIp,
        base + 40001
      );

      assert.isNotNull(repeated);
      assert.equal(repeated.failedAttempts, 4);
    }
  );

  it('preserves truncation state across detector instances',
    async () => {
      const config = {
        windowMs: 20000,
        threshold: 2,
        cooldownMs: 1000,
        maxTrackedIps: 100,
        maxEventsPerIp: 3
      };

      const detectorA = createSharedBruteForceDetector(config);
      const detectorB = createSharedBruteForceDetector(config);

      const base = Date.now() - 50000;

      assert.isNull(
        await detectorA.recordFailedLogin(truncationIp, base + 1000)
      );

      const first = await detectorB.recordFailedLogin(
        truncationIp,
        base + 1001
      );

      assert.isNotNull(first);
      assert.isFalse(first.countTruncated);

      await detectorA.recordFailedLogin(
        truncationIp,
        base + 1002
      );

      await detectorB.recordFailedLogin(
        truncationIp,
        base + 1003
      );

      const repeated = await detectorA.recordFailedLogin(
        truncationIp,
        base + 2001
      );

      assert.isNotNull(repeated);
      assert.isTrue(repeated.countTruncated);
      assert.equal(repeated.failedAttempts, 3);

      const state = await db.query(
        `SELECT failure_timestamps_ms
         FROM security_brute_force_state
         WHERE source_ip = $1::inet`,
        [truncationIp]
      );

      assert.lengthOf(
        state.rows[0].failure_timestamps_ms,
        3
      );

      // After the observation window expires,
      // truncation state should also expire.
      await detectorB.recordFailedLogin(
        truncationIp,
        base + 22004
      );

      const recovered = await db.query(
        `SELECT failure_timestamps_ms,
                truncated_until_ms
         FROM security_brute_force_state
         WHERE source_ip = $1::inet`,
        [truncationIp]
      );

      assert.lengthOf(
        recovered.rows[0].failure_timestamps_ms,
        1
      );

      assert.isNull(
        recovered.rows[0].truncated_until_ms
      );
    }
  );
});

describe('Shared Brute Force Capacity and Rollback', function () {
  this.timeout(30000);

  const ipA = '198.51.100.215';
  const ipB = '198.51.100.216';
  const rollbackIp = '198.51.100.217';

  before(() => {
    const url = new URL(process.env.DATABASE_URL || '');

    if (
      process.env.NODE_ENV !== 'test' ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '55432' ||
      url.pathname !== '/lb_test_db' ||
      url.username !== 'lb_test'
    ) {
      throw new Error('Isolated local test database required');
    }
  });

  async function cleanup() {
    await db.query(
      `DELETE FROM security_brute_force_state
       WHERE source_ip IN ($1::inet, $2::inet, $3::inet)`,
      [ipA, ipB, rollbackIp]
    );
  }

  beforeEach(cleanup);
  afterEach(cleanup);

  it('enforces capacity during concurrent IP creation', async () => {
    const initial = await db.query(
      'SELECT COUNT(*)::integer AS total FROM security_brute_force_state'
    );

    assert.equal(
      initial.rows[0].total,
      0,
      'The isolated test state must be empty'
    );

    const config = {
      maxTrackedIps: 1,
      maxEventsPerIp: 3,
      threshold: 2
    };

    const detectorA = createSharedBruteForceDetector(config);
    const detectorB = createSharedBruteForceDetector(config);

    await Promise.all([
      detectorA.recordFailedLogin(ipA),
      detectorB.recordFailedLogin(ipB)
    ]);

    const result = await db.query(
      'SELECT source_ip FROM security_brute_force_state'
    );

    assert.lengthOf(result.rows, 1);
  });

  it('rolls back an incomplete detection transaction', async () => {
    const originalGetClient = db.getClient;

    // Inject a test-only failure after the transaction
    // has created a state row but before its UPDATE.
    db.getClient = async () => {
      const client = await originalGetClient();

      return {
        query(sql, params) {
          if (
            typeof sql === 'string' &&
            sql.includes('UPDATE security_brute_force_state')
          ) {
            throw new Error('Injected UPDATE failure');
          }

          return client.query(sql, params);
        },

        release() {
          client.release();
        }
      };
    };

    try {
      const detector = createSharedBruteForceDetector();
      let capturedError = null;

      try {
        await detector.recordFailedLogin(rollbackIp);
      } catch (error) {
        capturedError = error;
      }

      assert.instanceOf(capturedError, Error);
      assert.include(
        capturedError.message,
        'Injected UPDATE failure'
      );
    } finally {
      db.getClient = originalGetClient;
    }

    // The INSERT must also have been rolled back.
    const afterFailure = await db.query(
      `SELECT source_ip
       FROM security_brute_force_state
       WHERE source_ip = $1::inet`,
      [rollbackIp]
    );

    assert.lengthOf(afterFailure.rows, 0);

    // A subsequent normal request must work.
    const detector = createSharedBruteForceDetector();

    assert.isNull(
      await detector.recordFailedLogin(rollbackIp)
    );

    const recovered = await db.query(
      `SELECT failure_timestamps_ms
       FROM security_brute_force_state
       WHERE source_ip = $1::inet`,
      [rollbackIp]
    );

    assert.lengthOf(recovered.rows, 1);
    assert.lengthOf(
      recovered.rows[0].failure_timestamps_ms,
      1
    );
  });
});

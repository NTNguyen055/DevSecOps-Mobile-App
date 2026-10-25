'use strict';

const { URL } = require('node:url');
const { assert } = require('chai');
const db = require('../../db');

const {
  createSharedBruteForceDetector
} = require('../../middleware/sharedBruteForceDetector');

describe('Shared Brute Force PostgreSQL Integration', function () {
  this.timeout(30000);

  const testIp = '198.51.100.210';

  before(async () => {
    const url = new URL(process.env.DATABASE_URL || '');

    if (
      process.env.NODE_ENV !== 'test' ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '55432' ||
      url.pathname !== '/lb_test_db'
    ) {
      throw new Error(
        'Integration tests require the isolated local test DB'
      );
    }

    await db.query(
      'SELECT 1 FROM security_brute_force_state LIMIT 1'
    );
  });

  async function cleanTestData() {
    await db.query(
      `DELETE FROM security_brute_force_state
       WHERE source_ip = $1::inet`,
      [testIp]
    );
  }

  beforeEach(cleanTestData);
  afterEach(cleanTestData);

  it('records 10 concurrent failures and generates one detection',
    async () => {
      const detectorA = createSharedBruteForceDetector();
      const detectorB = createSharedBruteForceDetector();

      // Same timestamp isolates database concurrency
      // from request-clock ordering.
      const now = Date.now();

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, index) => {
          const detector =
            index % 2 === 0 ? detectorA : detectorB;

          return detector.recordFailedLogin(testIp, now);
        })
      );

      const detections = results.filter(Boolean);

      assert.lengthOf(detections, 1);
      assert.equal(detections[0].type, 'possible_brute_force');
      assert.equal(detections[0].sourceIp, testIp);
      assert.equal(detections[0].failedAttempts, 10);

      const state = await db.query(
        `SELECT failure_timestamps_ms,
                last_alert_at_ms
         FROM security_brute_force_state
         WHERE source_ip = $1::inet`,
        [testIp]
      );

      assert.lengthOf(state.rows, 1);

      assert.lengthOf(
        state.rows[0].failure_timestamps_ms,
        10
      );

      assert.equal(
        Number(state.rows[0].last_alert_at_ms),
        now
      );

      // Cooldown must work across detector instances.
      const suppressed =
        await detectorB.recordFailedLogin(testIp, now + 1);

      assert.isNull(suppressed);
    }
  );
});

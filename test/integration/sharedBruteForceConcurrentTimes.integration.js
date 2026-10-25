'use strict';

const { assert } = require('chai');
const { URL } = require('node:url');
const db = require('../../db');

const {
  createSharedBruteForceDetector
} = require('../../middleware/sharedBruteForceDetector');

describe('Shared Brute Force Concurrent Timestamps', function () {
  this.timeout(30000);

  const testIp = '198.51.100.212';

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
       WHERE source_ip = $1::inet`,
      [testIp]
    );
  }

  beforeEach(cleanup);
  afterEach(cleanup);

  it('counts concurrent observations with different timestamps',
    async () => {
      const detectorA = createSharedBruteForceDetector();
      const detectorB = createSharedBruteForceDetector();

      const base = Date.now();

      // Distinct timestamps supplied in reverse order.
      const timestamps = Array.from(
        { length: 10 },
        (_, index) => base + (9 - index) * 10
      );

      const results = await Promise.all(
        timestamps.map((timestamp, index) => {
          const detector =
            index % 2 === 0 ? detectorA : detectorB;

          return detector.recordFailedLogin(
            testIp, timestamp
          );
        })
      );

      const detections = results.filter(Boolean);

      assert.lengthOf(detections, 1);
      assert.equal(
        detections[0].failedAttempts, 10
      );

      const result = await db.query(
        `SELECT failure_timestamps_ms, last_seen_ms
         FROM security_brute_force_state
         WHERE source_ip = $1::inet`,
        [testIp]
      );

      assert.lengthOf(result.rows, 1);

      const storedTimestamps =
        result.rows[0].failure_timestamps_ms.map(Number);

      assert.lengthOf(storedTimestamps, 10);

      assert.deepEqual(
        storedTimestamps,
        [...timestamps].sort((a, b) => a - b)
      );

      assert.equal(
        Number(result.rows[0].last_seen_ms),
        Math.max(...timestamps)
      );

      // An additional late observation must be retained
      // without producing a duplicate alert.
      const late = await detectorB.recordFailedLogin(
        testIp,
        base + 15
      );

      assert.isNull(late);

      const updated = await db.query(
        `SELECT failure_timestamps_ms
         FROM security_brute_force_state
         WHERE source_ip = $1::inet`,
        [testIp]
      );

      assert.lengthOf(
        updated.rows[0].failure_timestamps_ms,
        11
      );
    }
  );
});

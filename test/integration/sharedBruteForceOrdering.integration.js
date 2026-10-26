'use strict';

const { assert } = require('chai');
const { URL } = require('node:url');
const db = require('../../db');

const {
  createSharedBruteForceDetector
} = require('../../middleware/sharedBruteForceDetector');

describe('Shared Brute Force Timestamp Ordering', function () {
  this.timeout(10000);

  const testIp = '198.51.100.211';

  before(async () => {
    const url = new URL(process.env.DATABASE_URL || '');

    if (
      process.env.NODE_ENV !== 'test' ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '55432' ||
      url.pathname !== '/lb_test_db'
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

  it('does not lose an earlier observation processed later',
    async () => {
      const detectorA = createSharedBruteForceDetector();
      const detectorB = createSharedBruteForceDetector();

      const base = Date.now();

      // Simulate a later observation committing first.
      await detectorB.recordFailedLogin(testIp, base + 1000);

      // An earlier observation reaches the database afterward.
      await detectorA.recordFailedLogin(testIp, base);

      const result = await db.query(
        `SELECT failure_timestamps_ms
         FROM security_brute_force_state
         WHERE source_ip = $1::inet`,
        [testIp]
      );

      assert.lengthOf(result.rows, 1);
      assert.lengthOf(
        result.rows[0].failure_timestamps_ms,
        2
      );
    }
  );
});

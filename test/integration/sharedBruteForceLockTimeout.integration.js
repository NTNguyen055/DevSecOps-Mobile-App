'use strict';

const { URL } = require('node:url');
const { Client } = require('pg');
const { assert } = require('chai');

const {
  createSharedBruteForceDetector
} = require('../../middleware/sharedBruteForceDetector');

describe('Shared Brute Force Lock Timeout', function () {
  this.timeout(12000);

  const testIp = '198.51.100.250';

  before(() => {
    const databaseUrl = new URL(process.env.DATABASE_URL || '');

    if (
      process.env.NODE_ENV !== 'test' ||
      databaseUrl.hostname !== '127.0.0.1' ||
      databaseUrl.port !== '55432' ||
      databaseUrl.pathname !== '/lb_test_db'
    ) {
      throw new Error('Only the isolated local test DB is allowed');
    }
  });

  it('rolls back when PostgreSQL row locking times out', async () => {
    const locker = new Client({
      connectionString: process.env.DATABASE_URL
    });

    let rowCreated = false;
    let transactionOpen = false;

    await locker.connect();

    try {
      const existing = await locker.query(
        `SELECT 1 FROM security_brute_force_state
         WHERE source_ip = $1::inet`,
        [testIp]
      );

      assert.equal(existing.rowCount, 0, 'Test IP already exists');

      await locker.query(
        `INSERT INTO security_brute_force_state
           (source_ip, last_seen_ms)
         VALUES ($1::inet, $2)`,
        [testIp, Date.now()]
      );

      rowCreated = true;

      await locker.query('BEGIN');
      transactionOpen = true;

      await locker.query(
        `SELECT 1 FROM security_brute_force_state
         WHERE source_ip = $1::inet
         FOR UPDATE`,
        [testIp]
      );

      const detector = createSharedBruteForceDetector();

      let detectedError;
      const start = Date.now();

      try {
        await detector.recordFailedLogin(testIp);
      } catch (error) {
        detectedError = error;
      }

      const elapsed = Date.now() - start;

      assert.equal(
        detectedError?.code,
        '55P03',
        'Expected PostgreSQL lock timeout'
      );

      assert.isBelow(
        elapsed,
        6000,
        'Detector waited too long for the locked row'
      );

      await locker.query('ROLLBACK');
      transactionOpen = false;

      const state = await locker.query(
        `SELECT cardinality(failure_timestamps_ms) AS count
         FROM security_brute_force_state
         WHERE source_ip = $1::inet`,
        [testIp]
      );

      assert.equal(Number(state.rows[0].count), 0);
    } finally {
      if (transactionOpen) {
        await locker.query('ROLLBACK').catch(() => {});
      }

      try {
        if (rowCreated) {
          await locker.query(
            `DELETE FROM security_brute_force_state
             WHERE source_ip = $1::inet`,
            [testIp]
          );
        }
      } finally {
        await locker.end();
      }
    }
  });
});
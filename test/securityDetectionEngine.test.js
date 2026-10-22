
'use strict';

const { assert } = require('chai');

const {
  createBruteForceDetector
} = require('../middleware/securityDetectionEngine');

function createDetector(overrides = {}) {
  return createBruteForceDetector({
    windowMs: 60000,
    threshold: 3,
    cooldownMs: 30000,
    bucketMs: 1000,
    maxTrackedIps: 100,
    ...overrides
  });
}

describe('Brute Force Security Detection Engine', () => {
  const ip1 = '198.51.100.10';
  const ip2 = '203.0.113.20';

  it('excludes expired events at sliding-window boundaries', () => {
    const detector = createDetector({
      windowMs: 20000,
      threshold: 2,
      cooldownMs: 10000,
      bucketMs: 10000
    });

    // First failed login at 10.001 seconds.
    assert.isNull(
      detector.recordFailedLogin(ip1, 10001)
    );

    // Second failed login at 30.002 seconds.
    // The first event is now older than 20 seconds.
    // It must not contribute to the detection threshold.
    const event = detector.recordFailedLogin(ip1, 30002);

    assert.isNull(
      event,
      'Expired login attempts must not trigger a brute force alert'
    );
  });

  it('does not alert below the threshold', () => {
    const detector = createDetector();

    assert.isNull(detector.recordFailedLogin(ip1, 10000));
    assert.isNull(detector.recordFailedLogin(ip1, 11000));

    assert.equal(detector.getStats().trackedIps, 1);
  });

  it('detects brute force at the threshold', () => {
    const detector = createDetector();

    detector.recordFailedLogin(ip1, 10000);
    detector.recordFailedLogin(ip1, 11000);

    const event = detector.recordFailedLogin(ip1, 12000);

    assert.isNotNull(event);
    assert.equal(event.type, 'possible_brute_force');
    assert.equal(event.sourceIp, ip1);
    assert.equal(event.failedAttempts, 3);
    assert.equal(event.windowSeconds, 60);
    assert.equal(event.detectedAt, new Date(12000).toISOString());
  });

  it('tracks different IP addresses independently', () => {
    const detector = createDetector();

    detector.recordFailedLogin(ip1, 10000);
    detector.recordFailedLogin(ip1, 11000);
    detector.recordFailedLogin(ip2, 12000);

    assert.isNull(detector.recordFailedLogin(ip2, 13000));

    const event = detector.recordFailedLogin(ip1, 14000);

    assert.equal(event.sourceIp, ip1);
    assert.equal(event.failedAttempts, 3);
    assert.equal(detector.getStats().trackedIps, 2);
  });

  it('suppresses repeated alerts during cooldown', () => {
    const detector = createDetector({
      threshold: 2
    });

    detector.recordFailedLogin(ip1, 10000);

    const firstAlert = detector.recordFailedLogin(ip1, 11000);
    assert.isNotNull(firstAlert);

    const suppressed = detector.recordFailedLogin(ip1, 12000);
    assert.isNull(suppressed);

    const nextAlert = detector.recordFailedLogin(ip1, 41000);
    assert.isNotNull(nextAlert);
    assert.equal(nextAlert.sourceIp, ip1);
  });

  it('expires observations outside the sliding window', () => {
    const detector = createDetector({
      windowMs: 20000,
      threshold: 2
    });

    assert.isNull(detector.recordFailedLogin(ip1, 10000));

    // The previous observation is now outside the window.
    assert.isNull(detector.recordFailedLogin(ip1, 31000));

    const event = detector.recordFailedLogin(ip1, 32000);

    assert.isNotNull(event);
    assert.equal(event.failedAttempts, 2);
  });

  it('normalizes IPv4-mapped IPv6 addresses', () => {
    const detector = createDetector({
      threshold: 2
    });

    detector.recordFailedLogin(`::ffff:${ip1}`, 10000);

    const event = detector.recordFailedLogin(ip1, 11000);

    assert.isNotNull(event);
    assert.equal(event.sourceIp, ip1);
    assert.equal(detector.getStats().trackedIps, 1);
  });

  it('enforces tracking capacity and expires inactive IPs', () => {
    const detector = createDetector({
      windowMs: 20000,
      cooldownMs: 10000,
      maxTrackedIps: 1
    });

    detector.recordFailedLogin(ip1, 10000);

    // A second IP cannot enter while capacity is full.
    assert.isNull(detector.recordFailedLogin(ip2, 11000));

    assert.equal(detector.getStats().trackedIps, 1);
    assert.equal(detector.getStats().capacityDrops, 1);

    // The first IP expires after window + cooldown.
    detector.recordFailedLogin(ip2, 40000);

    assert.equal(detector.getStats().trackedIps, 1);
    assert.equal(detector.getStats().capacityDrops, 1);
  });

  it('rejects invalid sources and configuration', () => {
    const detector = createDetector();

    assert.isNull(detector.recordFailedLogin('not-an-ip', 10000));
    assert.isNull(detector.recordFailedLogin('', 10000));
    assert.isNull(detector.recordFailedLogin(null, 10000));

    assert.equal(detector.getStats().invalidSources, 3);

    assert.throws(
      () => createDetector({ threshold: 0 }),
      /Invalid security detector configuration/
    );

    assert.throws(
      () => createDetector({ bucketMs: 7000 }),
      /Invalid security detector configuration/
    );
  });

  it('excludes an event exactly at the window boundary', () => {
    const detector = createDetector({
      windowMs: 20000,
      threshold: 2
    });

    assert.isNull(
      detector.recordFailedLogin(ip1, 10000)
    );

    // Exactly 20 seconds later: first event is expired.
    assert.isNull(
      detector.recordFailedLogin(ip1, 30000)
    );

    // Only events at 30000 and 30001 are counted.
    const event = detector.recordFailedLogin(ip1, 30001);

    assert.isNotNull(event);
    assert.equal(event.failedAttempts, 2);
  });

  it('counts multiple failures within the same millisecond', () => {
    const detector = createDetector({
      threshold: 3
    });

    assert.isNull(detector.recordFailedLogin(ip1, 10000));
    assert.isNull(detector.recordFailedLogin(ip1, 10000));

    const event = detector.recordFailedLogin(ip1, 10000);

    assert.isNotNull(event);
    assert.equal(event.failedAttempts, 3);

    // Cooldown must suppress a repeated alert.
    assert.isNull(detector.recordFailedLogin(ip1, 10000));
  });

  it('marks counts as truncated when the per-IP limit is exceeded', () => {
    const detector = createDetector({
      windowMs: 20000,
      threshold: 2,
      cooldownMs: 1000,
      maxEventsPerIp: 2
    });

    detector.recordFailedLogin(ip1, 1000);

    const firstAlert = detector.recordFailedLogin(ip1, 1001);

    assert.isNotNull(firstAlert);
    assert.equal(firstAlert.failedAttempts, 2);
    assert.isFalse(firstAlert.countTruncated);

    // The third event exceeds the storage capacity.
    assert.isNull(detector.recordFailedLogin(ip1, 1002));

    assert.equal(
      detector.getStats().eventTruncations,
      1
    );

    const nextAlert = detector.recordFailedLogin(ip1, 2001);

    assert.isNotNull(nextAlert);
    assert.isTrue(nextAlert.countTruncated);

    // Two retained events, but actual attempts may be higher.
    assert.equal(nextAlert.failedAttempts, 2);
  });

  it('rejects out-of-order timestamps without corrupting state', () => {
    const detector = createDetector({
      threshold: 2
    });

    assert.isNull(
      detector.recordFailedLogin(ip1, 10000)
    );

    assert.throws(
      () => detector.recordFailedLogin(ip1, 9999),
      /Observation timestamps must be ordered/
    );

    const event = detector.recordFailedLogin(ip1, 10001);

    assert.isNotNull(event);
    assert.equal(event.failedAttempts, 2);
  });
});

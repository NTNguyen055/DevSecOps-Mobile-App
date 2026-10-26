
'use strict';

const { assert } = require('chai');

const loginSecurityMonitor = require(
  '../middleware/loginSecurityMonitor'
);

const {
  createBruteForceDetector
} = require('../middleware/securityDetectionEngine');

const {
  registry
} = require('../middleware/securityMetrics');

// Use an isolated in-memory detector for unit tests.
// PostgreSQL behavior is covered by integration tests.
const monitor =
  loginSecurityMonitor.createLoginSecurityMonitor(
    createBruteForceDetector({
      windowMs: 300000,
      threshold: 10,
      cooldownMs: 300000,
      maxTrackedIps: 1000,
      maxEventsPerIp: 256
    })
  );

async function getDetectionCount() {
  const metrics = await registry.metrics();

  const prefix =
    'app_security_detections_total' +
    '{type="possible_brute_force"} ';

  const line = metrics
    .split('\n')
    .find((item) => item.startsWith(prefix));

  return line
    ? Number(line.slice(prefix.length))
    : 0;
}

describe('Brute Force Detection Metrics', () => {
  const testIp = '198.51.100.77';

  it('increments the metric only when brute force is detected', async () => {
    const before = await getDetectionCount();

    // Nine failures should not generate an alert.
    for (let i = 0; i < 9; i++) {
      const event = await monitor.recordFailedLogin({
        ip: testIp
      });

      assert.isNull(event);
    }

    assert.equal(await getDetectionCount(), before);

    // The tenth failure reaches the detection threshold.
    const event = await monitor.recordFailedLogin({
      ip: testIp
    });

    assert.isNotNull(event);
    assert.equal(event.type, 'possible_brute_force');
    assert.equal(event.sourceIp, testIp);
    assert.equal(event.failedAttempts, 10);
    assert.equal(event.windowSeconds, 300);
    assert.isFalse(event.countTruncated);
    assert.exists(event.detectedAt);

    // Exactly one detection event should be counted.
    assert.equal(await getDetectionCount(), before + 1);

    // Additional failure during cooldown must not
    // generate another detection event.
    const suppressed = await monitor.recordFailedLogin({
      ip: testIp
    });

    assert.isNull(suppressed);
    assert.equal(await getDetectionCount(), before + 1);
  });

  it('records monitoring errors when the detector fails', async () => {
    const metricsBefore = await registry.metrics();

    const metricName = 'app_security_monitoring_errors_total';

    function readCounter(metrics) {
      const line = metrics
        .split('\n')
        .find((item) => item.startsWith(`${metricName} `));

      return line ? Number(line.slice(metricName.length + 1)) : 0;
    }

    const before = readCounter(metricsBefore);

    const failingDetector = {
      async recordFailedLogin() {
        throw new Error('Simulated PostgreSQL failure');
      }
    };

    const isolatedMonitor =
      loginSecurityMonitor.createLoginSecurityMonitor(
        failingDetector
      );

    const event = await isolatedMonitor.recordFailedLogin({
      ip: '198.51.100.78'
    });

    assert.isNull(event);

    assert.equal(
      isolatedMonitor.getMonitorStats().monitoringErrors,
      1
    );

    const metricsAfter = await registry.metrics();

    assert.equal(
      readCounter(metricsAfter),
      before + 1
    );
  });
});

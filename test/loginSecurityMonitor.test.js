
'use strict';

const { assert } = require('chai');

const loginSecurityMonitor = require(
  '../middleware/loginSecurityMonitor'
);

const {
  registry
} = require('../middleware/securityMetrics');

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
      const event = loginSecurityMonitor.recordFailedLogin({
        ip: testIp
      });

      assert.isNull(event);
    }

    assert.equal(await getDetectionCount(), before);

    // The tenth failure reaches the detection threshold.
    const event = loginSecurityMonitor.recordFailedLogin({
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
    const suppressed = loginSecurityMonitor.recordFailedLogin({
      ip: testIp
    });

    assert.isNull(suppressed);
    assert.equal(await getDetectionCount(), before + 1);
  });
});

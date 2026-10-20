
'use strict';

const { assert } = require('chai');

const {
  registry
} = require('../middleware/securityMetrics');

const {
  recordSuspectedIp
} = require('../middleware/suspectedIpMetrics');

describe('Suspected IP Security Metrics', () => {
  const metricName =
    'app_security_suspected_ip_last_detected_timestamp_seconds';

  function makeEvent(ip, now = Date.now()) {
    return {
      type: 'possible_brute_force',
      sourceIp: ip,
      detectedAt: new Date(now).toISOString()
    };
  }

  async function findIpMetric(ip) {
    const metrics = await registry.metrics();

    return metrics.split('\n').find((line) =>
      line.startsWith(`${metricName}{`) &&
      line.includes('type="possible_brute_force"') &&
      line.includes(`source_ip="${ip}"`)
    );
  }

  it('exports the suspected source IP and detection timestamp', async () => {
    const ip = '198.51.100.210';
    const event = makeEvent(ip);

    recordSuspectedIp(event);

    const line = await findIpMetric(ip);

    assert.isDefined(line);

    const actualTimestamp = Number(
      line.trim().split(/\s+/).pop()
    );

    assert.equal(
      actualTimestamp,
      Date.parse(event.detectedAt) / 1000
    );
  });

  it('limits active suspected IP metrics to 50 sources', async () => {
    const originalNow = Date.now;
    let now = originalNow();

    try {
      Date.now = () => now;

      // Record 51 different IPs.
      for (let i = 1; i <= 51; i++) {
        recordSuspectedIp(
          makeEvent(`198.51.100.${i}`, now)
        );

        now++;
      }

      const metrics = await registry.metrics();

      const activeSeries = metrics
        .split('\n')
        .filter((line) =>
          line.startsWith(`${metricName}{`)
        );

      assert.isAtMost(activeSeries.length, 50);

      // The oldest newly recorded IP must be evicted.
      assert.isUndefined(
        await findIpMetric('198.51.100.1')
      );

      // The newest IP must still be available.
      assert.isDefined(
        await findIpMetric('198.51.100.51')
      );
    } finally {
      Date.now = originalNow;
    }
  });

  it('removes expired IP metrics during collection', async () => {
    const originalNow = Date.now;
    const start = originalNow();
    let now = start;

    try {
      Date.now = () => now;

      const ip = '198.51.100.250';

      recordSuspectedIp(makeEvent(ip, now));

      assert.isDefined(await findIpMetric(ip));

      // Advance exactly 10 minutes.
      now = start + 10 * 60 * 1000;

      // Collecting metrics should remove expired IPs.
      assert.isUndefined(await findIpMetric(ip));
    } finally {
      Date.now = originalNow;
    }
  });
});

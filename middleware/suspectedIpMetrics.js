
'use strict';

const { Gauge } = require('@prometheus-io/client');
const { registry } = require('./securityMetrics');

const MAX_SUSPECTED_IPS = 50;
const IP_TTL_MS = 10 * 60 * 1000;
const DETECTION_TYPE = 'possible_brute_force';

// IP -> last observation time (milliseconds).
const suspectedIps = new Map();

const suspectedIpLastDetected = new Gauge({
  name: 'app_security_suspected_ip_last_detected_timestamp_seconds',
  help: 'Unix timestamp of the most recent brute force detection per suspected IP',
  labelNames: ['type', 'source_ip'],
  registers: [registry],

  // Clean expired series whenever Prometheus scrapes.
  collect() {
    removeExpiredIps(Date.now());
  }
});

function removeIp(ip) {
  suspectedIps.delete(ip);

  suspectedIpLastDetected.remove({
    type: DETECTION_TYPE,
    source_ip: ip
  });
}

function removeExpiredIps(now) {
  for (const [ip, lastSeen] of suspectedIps) {
    if (now - lastSeen >= IP_TTL_MS) {
      removeIp(ip);
    }
  }
}

function recordSuspectedIp(event) {
  if (event?.type !== DETECTION_TYPE) {
    return;
  }

  const detectedAtMs = Date.parse(event.detectedAt);

  if (!Number.isFinite(detectedAtMs)) {
    return;
  }

  const now = Date.now();
  removeExpiredIps(now);

  const ip = event.sourceIp;

  if (!suspectedIps.has(ip) &&
      suspectedIps.size >= MAX_SUSPECTED_IPS) {
    // Replace the IP with the oldest recorded detection.
    const oldestIp = suspectedIps.keys().next().value;
    removeIp(oldestIp);
  }

  // Refresh insertion order when an IP is detected again.
  suspectedIps.delete(ip);
  suspectedIps.set(ip, now);

  suspectedIpLastDetected.set(
    {
      type: DETECTION_TYPE,
      source_ip: ip
    },
    detectedAtMs / 1000
  );
}

module.exports = {
  recordSuspectedIp
};

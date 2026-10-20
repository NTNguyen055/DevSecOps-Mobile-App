
'use strict';

const {
  createBruteForceDetector
} = require('./securityDetectionEngine');

const {
  securityDetectionsTotal
} = require('./securityMetrics');

const {
  recordSuspectedIp
} = require('./suspectedIpMetrics');

// One shared detector for the application process.
const detector = createBruteForceDetector({
  windowMs: 5 * 60 * 1000,
  threshold: 10,
  cooldownMs: 5 * 60 * 1000,
  maxTrackedIps: 1000,
  maxEventsPerIp: 256
});

let monitoringErrors = 0;

function recordFailedLogin(req) {
  try {
    // Resolve the client IP using Express trusted proxy settings.
    const event = detector.recordFailedLogin(req.ip);

    // Count actual detection events, not every failed login.
    if (event) {
    securityDetectionsTotal.inc({
        type: event.type
    });

    recordSuspectedIp(event);
    }

    return event;
  } catch {
    // Security monitoring must not break authentication.
    monitoringErrors++;
    return null;
  }
}

function getMonitorStats() {
  return {
    ...detector.getStats(),
    monitoringErrors
  };
}

module.exports = {
  recordFailedLogin,
  getMonitorStats
};

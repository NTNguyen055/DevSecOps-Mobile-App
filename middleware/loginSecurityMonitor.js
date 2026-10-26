
'use strict';

const {
  securityDetectionsTotal,
  securityMonitoringErrorsTotal
} = require('./securityMetrics');

const {
  recordSuspectedIp
} = require('./suspectedIpMetrics');

// Allow an isolated detector to be injected for unit tests.
function createLoginSecurityMonitor(detector) {
  if (typeof detector?.recordFailedLogin !== 'function') {
    throw new TypeError('A valid detector is required');
  }

  let monitoringErrors = 0;

  async function recordFailedLogin(req) {
    try {
      const event = await detector.recordFailedLogin(req.ip);

      if (event) {
        securityDetectionsTotal.inc({
          type: event.type
        });

        recordSuspectedIp(event);
      }

      return event;
    } catch {
      // Monitoring failures must not interrupt authentication.
      monitoringErrors++;
      securityMonitoringErrorsTotal.inc();
      return null;
    }
  }

  function getMonitorStats() {
    return { monitoringErrors };
  }

  return {
    recordFailedLogin,
    getMonitorStats
  };
}

// Initialize the PostgreSQL-backed detector lazily.
// This allows unit tests to run without a real database.
let defaultMonitor;
let initializationErrors = 0;

function getDefaultMonitor() {
  if (!defaultMonitor) {
    const {
      createSharedBruteForceDetector
    } = require('./sharedBruteForceDetector');

    defaultMonitor = createLoginSecurityMonitor(
      createSharedBruteForceDetector()
    );
  }

  return defaultMonitor;
}

async function recordFailedLogin(req) {
  try {
    return await getDefaultMonitor().recordFailedLogin(req);
  } catch {
    initializationErrors++;
    securityMonitoringErrorsTotal.inc();
    return null;
  }
}

function getMonitorStats() {
  const stats = defaultMonitor
    ? defaultMonitor.getMonitorStats()
    : { monitoringErrors: 0 };

  return {
    monitoringErrors:
      stats.monitoringErrors + initializationErrors
  };
}

module.exports = {
  recordFailedLogin,
  getMonitorStats,
  createLoginSecurityMonitor
};

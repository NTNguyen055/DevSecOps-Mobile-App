'use strict';

const app = require('./app');
const createMetricsServer = require('./middleware/metricsServer');

const PORT = process.env.PORT || 4001;

const METRICS_PORT = process.env.METRICS_PORT || 9464;
const METRICS_HOST = process.env.METRICS_HOST || '127.0.0.1';

// Start the application API.
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

// Start a separate internal Prometheus metrics server.
const metricsServer = createMetricsServer();

metricsServer.listen(METRICS_PORT, METRICS_HOST, () => {
  console.log(
    `Metrics server is listening on ${METRICS_HOST}:${METRICS_PORT}`
  );
});

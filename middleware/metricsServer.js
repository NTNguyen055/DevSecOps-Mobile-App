
'use strict';

const http = require('node:http');
const { registry } = require('./securityMetrics');

function createMetricsServer() {
  return http.createServer(async (req, res) => {
    // Only the Prometheus scrape endpoint is supported.
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end('Not found\n');
      return;
    }

    try {
      const metrics = await registry.metrics();

      res.writeHead(200, {
        'Content-Type': registry.contentType,
        'Cache-Control': 'no-store'
      });

      res.end(metrics);
    } catch {
      res.writeHead(500, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end('Metrics unavailable\n');
    }
  });
}

module.exports = createMetricsServer;

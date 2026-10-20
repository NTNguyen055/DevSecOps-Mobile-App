
'use strict';

const { assert } = require('chai');
const express = require('express');
const request = require('supertest');

const httpMetricsMiddleware = require('../middleware/httpMetrics');
const { registry } = require('../middleware/securityMetrics');

describe('Application HTTP Metrics', () => {
  it('tracks requests with normalized routes and status codes', async () => {
    const app = express();

    app.use(httpMetricsMiddleware);

    const productsRouter = express.Router();

    productsRouter.get('/:id', (req, res) => {
      res.status(200).json({ ok: true });
    });

    app.use('/products', productsRouter);

    app.use((req, res) => {
      res.status(404).json({ message: 'Not found' });
    });

    // Two requests to the same route template.
    await request(app).get('/products/123').expect(200);
    await request(app).get('/products/456').expect(200);

    // Request to an unknown route.
    await request(app).get('/unknown-resource-999').expect(404);

    const metrics = await registry.metrics();

    // Dynamic IDs must be grouped into one route label.
    assert.include(
      metrics,
      'app_http_requests_total{method="GET",route="/products/:id",status_code="200"} 2'
    );

    // Unknown routes must use a fixed label.
    assert.include(
      metrics,
      'app_http_requests_total{method="GET",route="unmatched",status_code="404"} 1'
    );

    // The histogram must record completed requests.
    assert.include(
      metrics,
      'app_http_request_duration_seconds_count{method="GET",route="/products/:id",status_code="200"} 2'
    );

    // Raw URL parameters must not appear in metrics.
    assert.notInclude(metrics, '/products/123');
    assert.notInclude(metrics, '/products/456');
    assert.notInclude(metrics, '/unknown-resource-999');
  });
});

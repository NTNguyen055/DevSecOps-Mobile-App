
'use strict';

const { assert } = require('chai');
const request = require('supertest');

const createMetricsServer = require('../middleware/metricsServer');
const { registry } = require('../middleware/securityMetrics');

describe('Internal Metrics Server', () => {
  it('exposes Prometheus metrics on GET /metrics', async () => {
    const server = createMetricsServer();

    const response = await request(server)
      .get('/metrics')
      .expect(200);

    assert.match(
      response.headers['content-type'],
      /^text\/plain/
    );

    assert.equal(
      response.headers['cache-control'],
      'no-store'
    );

    assert.include(
      response.text,
      '# HELP app_http_requests_total'
    );

    assert.include(
      response.text,
      '# HELP app_http_request_duration_seconds'
    );

    assert.include(
      response.text,
      '# HELP app_auth_login_attempts_total'
    );

    assert.equal(
      response.text,
      await registry.metrics()
    );
  });

  it('returns 404 for unknown endpoints', async () => {
    const server = createMetricsServer();

    const response = await request(server)
      .get('/')
      .expect(404);

    assert.equal(response.text, 'Not found\n');
  });

  it('rejects POST requests to /metrics', async () => {
    const server = createMetricsServer();

    const response = await request(server)
      .post('/metrics')
      .expect(404);

    assert.equal(response.text, 'Not found\n');
  });
});

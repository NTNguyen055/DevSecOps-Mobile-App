
'use strict';

const {
  httpRequestsTotal,
  httpRequestDurationSeconds
} = require('./securityMetrics');

const ALLOWED_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS'
]);

const ALLOWED_BASE_PATHS = new Set([
  '',
  '/auth',
  '/products',
  '/users',
  '/cart',
  '/orders'
]);

function getRouteLabel(req) {
  const baseUrl = req.baseUrl || '';
  const routePath = req.route?.path;

  if (
    !ALLOWED_BASE_PATHS.has(baseUrl) ||
    typeof routePath !== 'string' ||
    !routePath.startsWith('/')
  ) {
    return 'unmatched';
  }

  return `${baseUrl}${routePath}`.replace(/\/{2,}/g, '/');
}

function httpMetricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.once('finish', () => {
    const durationSeconds =
      Number(process.hrtime.bigint() - start) / 1e9;

    const labels = {
      method: ALLOWED_METHODS.has(req.method)
        ? req.method
        : 'OTHER',
      route: getRouteLabel(req),
      status_code: String(res.statusCode)
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(
      labels,
      durationSeconds
    );
  });

  next();
}

module.exports = httpMetricsMiddleware;

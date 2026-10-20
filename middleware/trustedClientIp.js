
'use strict';

const { isIP } = require('node:net');

function configureTrustedProxy(
  app,
  trustedProxyIp = process.env.TRUSTED_PROXY_IP
) {
  // Fail closed when no trusted proxy is configured.
  if (trustedProxyIp === undefined) {
    app.set('trust proxy', false);
    return;
  }

  if (typeof trustedProxyIp !== 'string') {
    throw new Error('TRUSTED_PROXY_IP must be a string');
  }

  const ip = trustedProxyIp.trim();

  if (!isIP(ip)) {
    throw new Error('TRUSTED_PROXY_IP is invalid');
  }

  // Trust only this exact proxy IP.
  app.set('trust proxy', [ip]);
}

module.exports = configureTrustedProxy;

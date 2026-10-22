
'use strict';

const { assert } = require('chai');
const express = require('express');
const request = require('supertest');

const configureTrustedProxy = require(
  '../middleware/trustedClientIp'
);

function createTestApp(trustedProxyIp) {
  const app = express();

  configureTrustedProxy(app, trustedProxyIp);

  app.get('/ip', (req, res) => {
    res.status(200).json({
      clientIp: req.ip,
      socketIp: req.socket.remoteAddress
    });
  });

  return app;
}

describe('Trusted Client IP Security', () => {
  it('does not trust forwarded headers by default', async () => {
    const original = process.env.TRUSTED_PROXY_IP;

    delete process.env.TRUSTED_PROXY_IP;

    try {
      const app = createTestApp();

      const response = await request(app)
        .get('/ip')
        .set('X-Forwarded-For', '203.0.113.99')
        .expect(200);

      assert.equal(
        response.body.clientIp,
        response.body.socketIp
      );
    } finally {
      if (original === undefined) {
        delete process.env.TRUSTED_PROXY_IP;
      } else {
        process.env.TRUSTED_PROXY_IP = original;
      }
    }
  });

  it('rejects a forged IP from an untrusted peer', async () => {
    const app = createTestApp('192.0.2.10');

    const response = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.99')
      .expect(200);

    assert.equal(
      response.body.clientIp,
      response.body.socketIp
    );

    assert.notEqual(
      response.body.clientIp,
      '203.0.113.99'
    );
  });

  it('resolves the client IP from a trusted proxy', async () => {
    const app = createTestApp('127.0.0.1');

    const response = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '198.51.100.20')
      .expect(200);

    assert.equal(
      response.body.clientIp,
      '198.51.100.20'
    );
  });

  it('ignores forged entries before the nearest client', async () => {
    const app = createTestApp('127.0.0.1');

    const response = await request(app)
      .get('/ip')
      .set(
        'X-Forwarded-For',
        '203.0.113.99, 198.51.100.20'
      )
      .expect(200);

    assert.equal(
      response.body.clientIp,
      '198.51.100.20'
    );
  });

  it('rejects an invalid trusted proxy IP', () => {
    const app = express();

    assert.throws(
      () => configureTrustedProxy(app, 'not-an-ip'),
      /TRUSTED_PROXY_IP is invalid/
    );
  });

  it('rejects a non-string trusted proxy value', () => {
    const app = express();

    assert.throws(
      () => configureTrustedProxy(app, 12345),
      /TRUSTED_PROXY_IP must be a string/
    );
  });
});

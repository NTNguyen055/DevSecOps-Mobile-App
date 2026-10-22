
'use strict';

const { assert } = require('chai');
const express = require('express');
const request = require('supertest');

const bcrypt = require('bcrypt');

// Supply a dummy database URL only during module initialization.
// Authentication tests mock database operations and never connect.
const originalDatabaseUrl = process.env.DATABASE_URL;

if (!originalDatabaseUrl) {
  process.env.DATABASE_URL =
    'postgresql://test:test@127.0.0.1:5432/unit_test';
}

const userModel = require('../models/userModel');
const authRoutes = require('../routes/auth.routes');

// Restore the environment after modules are loaded.
if (originalDatabaseUrl === undefined) {
  delete process.env.DATABASE_URL;
} else {
  process.env.DATABASE_URL = originalDatabaseUrl;
}

const { registry } = require('../middleware/securityMetrics');
const loginSecurityMonitor = require('../middleware/loginSecurityMonitor');

// Read the counter from the Prometheus exposition format.
async function getLoginCounter(outcome, reason) {
  const metrics = await registry.metrics();

  const prefix =
    'app_auth_login_attempts_total' +
    `{outcome="${outcome}",reason="${reason}"} `;

  const line = metrics
    .split('\n')
    .find((item) => item.startsWith(prefix));

  return line ? Number(line.slice(prefix.length)) : 0;
}

describe('Application Authentication Metrics', () => {
  const originalFindUser = userModel.findUserByEmail;
  const originalCompare = bcrypt.compare;
  const originalRecordFailedLogin = loginSecurityMonitor.recordFailedLogin;
  const originalJwtSecret = process.env.JWT_SECRET;

  const app = express();

  app.use(express.json());
  app.use('/auth', authRoutes);

  before(() => {
    process.env.JWT_SECRET = 'test-only-auth-metrics-secret';
  });

  afterEach(() => {
    userModel.findUserByEmail = originalFindUser;
    bcrypt.compare = originalCompare;
    loginSecurityMonitor.recordFailedLogin = originalRecordFailedLogin;
  });

  after(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('counts missing login fields as rejected', async () => {
    const before = await getLoginCounter(
      'rejected',
      'missing_fields'
    );

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com' });

    assert.equal(response.status, 400);

    const after = await getLoginCounter(
      'rejected',
      'missing_fields'
    );

    assert.equal(after, before + 1);
  });

  it('counts unknown users as invalid credentials', async () => {
    userModel.findUserByEmail = async () => null;

    const before = await getLoginCounter(
      'failure',
      'invalid_credentials'
    );

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: 'unknown@example.com',
        password: 'incorrect'
      });

    assert.equal(response.status, 401);

    const after = await getLoginCounter(
      'failure',
      'invalid_credentials'
    );

    assert.equal(after, before + 1);
  });

  it('counts incorrect passwords as invalid credentials', async () => {
    userModel.findUserByEmail = async () => ({
      id: 1,
      email: 'test@example.com',
      password_hash: 'mock-hash'
    });

    bcrypt.compare = async () => false;

    const before = await getLoginCounter(
      'failure',
      'invalid_credentials'
    );

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'incorrect'
      });

    assert.equal(response.status, 401);

    const after = await getLoginCounter(
      'failure',
      'invalid_credentials'
    );

    assert.equal(after, before + 1);
  });

  it('counts successful logins', async () => {
    userModel.findUserByEmail = async () => ({
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      password_hash: 'mock-hash'
    });

    bcrypt.compare = async () => true;

    const before = await getLoginCounter(
      'success',
      'authenticated'
    );

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'correct'
      });

    assert.equal(response.status, 200);
    assert.exists(response.body.token);

    const after = await getLoginCounter(
      'success',
      'authenticated'
    );

    assert.equal(after, before + 1);
  });

  it('counts internal login errors', async () => {
    userModel.findUserByEmail = async () => {
      throw new Error('Simulated database error');
    };

    const before = await getLoginCounter(
      'error',
      'internal_error'
    );

    const response = await request(app)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'test-password'
      });

    assert.equal(response.status, 500);

    const after = await getLoginCounter(
      'error',
      'internal_error'
    );

    assert.equal(after, before + 1);
  });

  it('records brute force observations for both invalid credential branches', async () => {
    const observedIps = [];

    loginSecurityMonitor.recordFailedLogin = (req) => {
      observedIps.push(req.ip);
      return null;
    };

    userModel.findUserByEmail = async (email) => {
      if (email === 'unknown@example.com') {
        return null;
      }

      return {
        id: 1,
        username: 'testuser',
        email,
        password_hash: 'mock-hash'
      };
    };

    bcrypt.compare = async () => false;

    // Unknown account: HTTP 401.
    await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', '203.0.113.99')
      .send({
        email: 'unknown@example.com',
        password: 'incorrect'
      })
      .expect(401);

    // Incorrect password: HTTP 401.
    await request(app)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'incorrect'
      })
      .expect(401);

    // Missing fields: HTTP 400, no brute force observation.
    await request(app)
      .post('/auth/login')
      .send({})
      .expect(400);

    assert.lengthOf(observedIps, 2);

    // This isolated Express test app does not trust proxies.
    assert.notInclude(observedIps, '203.0.113.99');
  });

  it('does not record successful logins or internal errors as brute force', async () => {
    let observations = 0;

    loginSecurityMonitor.recordFailedLogin = () => {
      observations++;
      return null;
    };

    userModel.findUserByEmail = async () => ({
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      password_hash: 'mock-hash'
    });

    bcrypt.compare = async () => true;

    // Successful authentication.
    await request(app)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'correct'
      })
      .expect(200);

    // Simulated internal failure.
    userModel.findUserByEmail = async () => {
      throw new Error('Simulated database failure');
    };

    await request(app)
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'test'
      })
      .expect(500);

    assert.equal(observations, 0);
  });
});

'use strict';

const fs = require('node:fs');
const { URL } = require('node:url');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const poolConfig = {
  connectionString
};

if (process.env.NODE_ENV === 'production') {
  // Limit connection establishment and pool acquisition wait.
  poolConfig.connectionTimeoutMillis = 3000;

  const caFile = process.env.RDS_CA_FILE;

  if (!caFile) {
    throw new Error('RDS_CA_FILE is required in production');
  }

  // Prevent connection-string parameters from overriding TLS settings.
  const databaseUrl = new URL(connectionString);

  for (const parameter of [
    'sslmode',
    'sslcert',
    'sslkey',
    'sslrootcert'
  ]) {
    if (databaseUrl.searchParams.has(parameter)) {
      throw new Error(
        `Unsupported TLS parameter in DATABASE_URL: ${parameter}`
      );
    }
  }

  const ca = fs.readFileSync(caFile, 'utf8');

  if (!ca.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error('Invalid RDS CA bundle');
  }

  poolConfig.ssl = {
    ca,
    rejectUnauthorized: true
  };
}

const pool = new Pool(poolConfig);

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect()
};
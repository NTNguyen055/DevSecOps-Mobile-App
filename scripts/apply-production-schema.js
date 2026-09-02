require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const {
  SecretsManagerClient,
  GetSecretValueCommand
} = require('@aws-sdk/client-secrets-manager');

const REGION = process.env.AWS_REGION || 'ap-southeast-1';
const RDS_SECRET_ID = process.env.RDS_SECRET_ID;
const RDS_HOST = process.env.RDS_HOST;
const RDS_PORT = process.env.RDS_PORT || '5432';
const RDS_DATABASE = process.env.RDS_DATABASE;

if (!RDS_SECRET_ID) {
  throw new Error('RDS_SECRET_ID is not defined');
}

if (!RDS_HOST || !RDS_DATABASE) {
  throw new Error('RDS_HOST or RDS_DATABASE is not defined');
}

const secretsManager = new SecretsManagerClient({
  region: REGION
});

async function getRdsSecret() {
  const command = new GetSecretValueCommand({
    SecretId: RDS_SECRET_ID
  });

  const response = await secretsManager.send(command);

  if (!response.SecretString) {
    throw new Error('RDS secret SecretString is empty');
  }

  return JSON.parse(response.SecretString);
}

async function applySchema() {
  let client;

  try {
    console.log('Loading RDS credentials from AWS Secrets Manager...');

    const secret = await getRdsSecret();

    if (!secret.username || !secret.password) {
      throw new Error('RDS secret must contain username and password');
    }

    const username = encodeURIComponent(secret.username);
    const password = encodeURIComponent(secret.password);

    const connectionString =
      `postgresql://${username}:${password}` +
      `@${RDS_HOST}:${RDS_PORT}/${RDS_DATABASE}`;

    client = new Client({
      connectionString,
      ssl: {
        rejectUnauthorized: false
      }
    });

    console.log('Connecting to RDS PostgreSQL...');
    await client.connect();

    const schemaPath = path.join(
      __dirname,
      '..',
      'db',
      'schema.sql'
    );

    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Applying database schema...');
    await client.query(schema);

    console.log('Database schema applied successfully.');
  } catch (error) {
    console.error('Failed to apply production schema:', error);
    process.exitCode = 1;
  } finally {
    if (client) {
      await client.end().catch(() => {});
    }
  }
}

applySchema();

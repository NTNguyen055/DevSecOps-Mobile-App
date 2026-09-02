const {
  SecretsManagerClient,
  GetSecretValueCommand
} = require('@aws-sdk/client-secrets-manager');

const REGION = process.env.AWS_REGION || 'ap-southeast-1';

const RDS_SECRET_ID = process.env.RDS_SECRET_ID;
const JWT_SECRET_ID = process.env.JWT_SECRET_ID;

const RDS_HOST = process.env.RDS_HOST;
const RDS_PORT = process.env.RDS_PORT || '5432';
const RDS_DATABASE = process.env.RDS_DATABASE;

if (!RDS_SECRET_ID) {
  throw new Error('RDS_SECRET_ID is not defined');
}

if (!JWT_SECRET_ID) {
  throw new Error('JWT_SECRET_ID is not defined');
}

if (!RDS_HOST || !RDS_DATABASE) {
  throw new Error('RDS_HOST or RDS_DATABASE is not defined');
}

const secretsManager = new SecretsManagerClient({
  region: REGION
});

async function getSecret(secretId) {
  const command = new GetSecretValueCommand({
    SecretId: secretId
  });

  const response = await secretsManager.send(command);

  if (!response.SecretString) {
    throw new Error(`SecretString is empty for secret: ${secretId}`);
  }

  return JSON.parse(response.SecretString);
}

async function start() {
  console.log('Loading production secrets from AWS Secrets Manager...');

  const [rdsSecret, jwtSecret] = await Promise.all([
    getSecret(RDS_SECRET_ID),
    getSecret(JWT_SECRET_ID)
  ]);

  if (!rdsSecret.username || !rdsSecret.password) {
    throw new Error('RDS secret must contain username and password');
  }

  if (!jwtSecret.JWT_SECRET) {
    throw new Error('JWT secret must contain JWT_SECRET');
  }

  const username = encodeURIComponent(rdsSecret.username);
  const password = encodeURIComponent(rdsSecret.password);

  process.env.DATABASE_URL =
    `postgresql://${username}:${password}` +
    `@${RDS_HOST}:${RDS_PORT}/${RDS_DATABASE}?sslmode=require`;

  process.env.JWT_SECRET = jwtSecret.JWT_SECRET;

  console.log('Production secrets loaded successfully.');
  console.log('Starting API server...');

  require('../server');
}

start().catch((error) => {
  console.error('Failed to start production server:', error);
  process.exit(1);
});
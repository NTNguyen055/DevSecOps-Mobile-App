
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const {
  SecretsManagerClient,
  GetSecretValueCommand
} = require('@aws-sdk/client-secrets-manager');

const MIGRATION_FILE = path.join(
  __dirname,
  '..',
  'db',
  'migrations',
  '001_shared_brute_force_state.sql'
);

async function connectionConfig() {
  const args = process.argv.slice(2);

  const allowedArgs = new Set([
    '--local-test',
    '--check-connection'
  ]);

  if (
    args.some(arg => !allowedArgs.has(arg)) ||
    args.length !== new Set(args).size
  ) {
    throw new Error('Unsupported or duplicate migration arguments');
  }

  const localTest = args.includes('--local-test');


  if (localTest) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Local test mode is forbidden in production');
    }

    if (!process.env.MIGRATION_DATABASE_URL) {
      throw new Error('MIGRATION_DATABASE_URL is required for local test');
    }

    return {
      connectionString: process.env.MIGRATION_DATABASE_URL,
      connectionTimeoutMillis: 10000
    };
  }

  const {
    RDS_SECRET_ID,
    RDS_HOST,
    RDS_DATABASE,
    RDS_CA_FILE
  } = process.env;

  if (!RDS_SECRET_ID || !RDS_HOST || !RDS_DATABASE || !RDS_CA_FILE) {
    throw new Error('Required production RDS configuration is missing');
  }

  const port = Number(process.env.RDS_PORT || '5432');

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid RDS_PORT');
  }

  const secretsManager = new SecretsManagerClient({
    region: process.env.AWS_REGION || 'ap-southeast-1'
  });

  let secret;

  try {
    const result = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: RDS_SECRET_ID })
    );

    if (!result.SecretString) {
      throw new Error('RDS secret is empty');
    }

    secret = JSON.parse(result.SecretString);
  } finally {
    secretsManager.destroy();
  }

  if (!secret.username || !secret.password) {
    throw new Error('RDS credentials are incomplete');
  }

  return {
    host: RDS_HOST,
    port,
    database: RDS_DATABASE,
    user: secret.username,
    password: secret.password,
    ssl: {
      ca: fs.readFileSync(RDS_CA_FILE, 'utf8'),
      rejectUnauthorized: true
    },
    connectionTimeoutMillis: 10000
  };
}

async function runReadOnlyPreflight(client, localTest) {
  console.log('Running read-only migration preflight...');

  const tlsResult = await client.query(`
    SELECT ssl, version
    FROM pg_stat_ssl
    WHERE pid = pg_backend_pid()
  `);

  if (!localTest) {
    if (tlsResult.rows[0]?.ssl !== true) {
      throw new Error('RDS connection is not using TLS');
    }

    if (client.connection.stream?.authorized !== true) {
      throw new Error('RDS TLS certificate verification failed');
    }
  }

  const privilegeResult = await client.query(`
    SELECT has_schema_privilege(
      current_user,
      'public',
      'CREATE'
    ) AS can_create
  `);

  if (privilegeResult.rows[0]?.can_create !== true) {
    throw new Error('Database user lacks CREATE privilege');
  }

  console.log('MIGRATION READ-ONLY PREFLIGHT: PASS');
}

async function validateMigrationSchema(client) {
  const columnResult = await client.query(`
    SELECT
      a.attname AS column_name,
      format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull AS not_null,
      pg_get_expr(d.adbin, d.adrelid) AS default_expression
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d
      ON d.adrelid = a.attrelid
     AND d.adnum = a.attnum
    WHERE a.attrelid =
      'public.security_brute_force_state'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
  `);

  const columns = new Map(
    columnResult.rows.map(row => [row.column_name, row])
  );

  const expectedColumns = {
    source_ip: ['inet', true],
    failure_timestamps_ms: ['bigint[]', true],
    last_seen_ms: ['bigint', true],
    last_alert_at_ms: ['bigint', false],
    truncated_until_ms: ['bigint', false]
  };

  for (const [name, [type, notNull]] of
    Object.entries(expectedColumns)) {
    const actual = columns.get(name);

    if (
      actual?.data_type !== type ||
      actual?.not_null !== notNull
    ) {
      throw new Error(`Invalid migration column: ${name}`);
    }
  }

  if (
    columns.get('failure_timestamps_ms')
      .default_expression !== "'{}'::bigint[]"
  ) {
    throw new Error('Invalid failure timestamps default');
  }

  const constraintResult = await client.query(`
    SELECT
      conname,
      contype,
      convalidated,
      pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid =
      'public.security_brute_force_state'::regclass
  `);

  const constraints = new Map(
    constraintResult.rows.map(row => [row.conname, row])
  );

  const expectedConstraints = {
    security_brute_force_state_pkey: [
      'p',
      'PRIMARY KEY (source_ip)'
    ],
    security_brute_force_max_events: [
      'c',
      'CHECK (cardinality(failure_timestamps_ms) <= 256)'
    ],
    security_brute_force_state_last_seen_ms_check: [
      'c',
      'CHECK (last_seen_ms >= 0)'
    ],
    security_brute_force_state_last_alert_at_ms_check: [
      'c',
      'CHECK (last_alert_at_ms IS NULL OR last_alert_at_ms >= 0)'
    ],
    security_brute_force_state_truncated_until_ms_check: [
      'c',
      'CHECK (truncated_until_ms IS NULL OR truncated_until_ms >= 0)'
    ]
  };

  // Normalize formatting differences in PostgreSQL output.
  const normalize = value =>
    value.replace(/[()\s]/g, '').toLowerCase();

  for (const [name, [type, definition]] of
    Object.entries(expectedConstraints)) {
    const actual = constraints.get(name);

    if (
      actual?.contype !== type ||
      actual?.convalidated !== true ||
      normalize(actual?.definition ?? '') !== normalize(definition)
    ) {
      throw new Error(`Invalid migration constraint: ${name}`);
    }
  }

  const indexResult = await client.query(`
    SELECT
      i.indisvalid AS is_valid,
      i.indisready AS is_ready,
      i.indisunique AS is_unique,
      i.indnkeyatts AS key_count,
      i.indnatts AS total_count,
      i.indpred IS NULL AS no_predicate,
      i.indexprs IS NULL AS no_expressions,
      am.amname AS access_method,
      pg_get_indexdef(i.indexrelid, 1, true) AS key_column
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_am am ON am.oid = idx.relam
    WHERE i.indexrelid =
      to_regclass('public.idx_security_brute_force_last_seen')
      AND i.indrelid =
        'public.security_brute_force_state'::regclass
  `);

  const index = indexResult.rows[0];

  if (
    index?.is_valid !== true ||
    index?.is_ready !== true ||
    index?.is_unique !== false ||
    Number(index?.key_count) !== 1 ||
    Number(index?.total_count) !== 1 ||
    index?.no_predicate !== true ||
    index?.no_expressions !== true ||
    index?.access_method !== 'btree' ||
    index?.key_column !== 'last_seen_ms'
  ) {
    throw new Error('Invalid migration index');
  }

  console.log('SHARED BRUTE FORCE SCHEMA VALIDATION: PASS');
}

async function main() {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');

  const client = new Client(await connectionConfig());

  try {
    await client.connect();

    console.log('Connected to migration database');

    if (process.argv.includes('--check-connection')) {
      const localTest = process.argv.includes('--local-test');

      await runReadOnlyPreflight(client, localTest);
      return;
    }

    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '45s'");
    await client.query('SET LOCAL search_path TO public');

    await client.query(sql);

    await validateMigrationSchema(client);

    await client.query('COMMIT');

    console.log('SHARED BRUTE FORCE MIGRATION: PASS');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original error.
    }

    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(error => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});

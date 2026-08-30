const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const isSsl = connectionString.includes('sslmode=require') || process.env.DB_SSL === 'true';

const pool = new Pool({
  connectionString: connectionString,
  ssl: isSsl ? { rejectUnauthorized: false } : false
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect()
};
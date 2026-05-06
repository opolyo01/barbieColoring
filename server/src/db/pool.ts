import { Pool } from 'pg';
import { DATABASE_SSL, DATABASE_URL } from '../config';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_SSL,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
});

export default pool;

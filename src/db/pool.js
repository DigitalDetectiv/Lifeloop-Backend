import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  // Free-tier Postgres (Neon included) suspends its compute after being
  // idle and can take several seconds to wake back up on the next
  // connection. 20s gives that a real chance to succeed instead of the
  // pool giving up too early and surfacing a confusing error.
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
  // Idle client errors shouldn't crash the whole process.
  console.error('Unexpected Postgres pool error', err);
});

// Small convenience wrapper so callers don't need to import pg directly.
// Retries once on a connection-level failure (ENOTFOUND, connection
// terminated, etc.) since those are usually the database waking up from
// idle, not a real problem - a second attempt a moment later succeeds in
// that case, matching what free-tier Postgres cold starts look like.
export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    const isConnectionIssue = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(err.code) ||
      err.message?.includes('Connection terminated');
    if (!isConnectionIssue) throw err;

    console.warn('Database connection issue, retrying once (likely a cold-start wake-up)...', err.message);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return pool.query(text, params);
  }
}

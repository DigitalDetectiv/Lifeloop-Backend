import { query } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertValidDate(date) {
  if (!DATE_RE.test(date)) throw new ApiError(400, 'date must be in YYYY-MM-DD format.');
}

export const getEntry = asyncHandler(async (req, res) => {
  const { date } = req.params;
  assertValidDate(date);

  const { rows } = await query(
    'SELECT * FROM journal_entries WHERE user_id = $1 AND entry_date = $2',
    [req.userId, date]
  );
  res.json({ date, fields: rows[0]?.fields ?? {} });
});

// Upserts and MERGES with whatever fields already exist for that day, so
// the frontend can send just the one box the user edited rather than the
// whole day's object every time.
export const upsertEntry = asyncHandler(async (req, res) => {
  const { date } = req.params;
  assertValidDate(date);
  const { fields } = req.body;
  if (!fields || typeof fields !== 'object') throw new ApiError(400, 'fields object is required.');

  const { rows } = await query(
    `INSERT INTO journal_entries (user_id, entry_date, fields)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, entry_date)
     DO UPDATE SET fields = journal_entries.fields || $3
     RETURNING *`,
    [req.userId, date, JSON.stringify(fields)]
  );
  res.json({ date, fields: rows[0].fields });
});

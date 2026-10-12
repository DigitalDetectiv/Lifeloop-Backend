import { query } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function toPublic(row) {
  return {
    id: row.id,
    direction: row.direction,
    person: row.person,
    amount: Number(row.amount),
    settled: row.settled
  };
}

export const listEntries = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM ledger_entries WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
  res.json({
    toGive: rows.filter((r) => r.direction === 'give').map(toPublic),
    toReceive: rows.filter((r) => r.direction === 'receive').map(toPublic)
  });
});

export const createEntry = asyncHandler(async (req, res) => {
  const { direction, person, amount } = req.body;
  if (!['give', 'receive'].includes(direction)) throw new ApiError(400, "direction must be 'give' or 'receive'.");
  if (!person || amount == null) throw new ApiError(400, 'person and amount are required.');

  const { rows } = await query(
    `INSERT INTO ledger_entries (user_id, direction, person, amount)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.userId, direction, person.trim(), amount]
  );
  res.status(201).json({ entry: toPublic(rows[0]) });
});

export const updateEntry = asyncHandler(async (req, res) => {
  const { settled } = req.body;
  const { rows } = await query(
    'UPDATE ledger_entries SET settled = COALESCE($1, settled) WHERE id = $2 AND user_id = $3 RETURNING *',
    [settled, req.params.id, req.userId]
  );
  if (rows.length === 0) throw new ApiError(404, 'Ledger entry not found.');
  res.json({ entry: toPublic(rows[0]) });
});

export const deleteEntry = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM ledger_entries WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) throw new ApiError(404, 'Ledger entry not found.');
  res.status(204).end();
});

import { query } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { encryptPassword, decryptPassword } from '../services/vaultCrypto.js';

function toPublic(row) {
  // Never include the encrypted password/iv/authTag in list responses -
  // only the dedicated reveal endpoint decrypts, and only on request.
  return { id: row.id, label: row.label, username: row.username };
}

export const listEntries = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM vault_entries WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
  res.json({ entries: rows.map(toPublic) });
});

export const createEntry = asyncHandler(async (req, res) => {
  const { label, username, password } = req.body;
  if (!label || !username || !password) throw new ApiError(400, 'label, username, and password are required.');

  const { encryptedPassword, iv, authTag } = encryptPassword(password);
  const { rows } = await query(
    `INSERT INTO vault_entries (user_id, label, username, encrypted_password, iv, auth_tag)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.userId, label.trim(), username.trim(), encryptedPassword, iv, authTag]
  );
  res.status(201).json({ entry: toPublic(rows[0]) });
});

// Separate, explicit endpoint to decrypt - keeps plaintext passwords out
// of the normal list response entirely.
export const revealEntry = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM vault_entries WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) throw new ApiError(404, 'Vault entry not found.');

  const row = rows[0];
  const password = decryptPassword({
    encryptedPassword: row.encrypted_password,
    iv: row.iv,
    authTag: row.auth_tag
  });
  res.json({ password });
});

export const deleteEntry = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM vault_entries WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) throw new ApiError(404, 'Vault entry not found.');
  res.status(204).end();
});

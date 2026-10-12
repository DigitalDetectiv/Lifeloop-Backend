import { query } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function toPublic(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    note: row.note,
    sortOrder: row.sort_order
  };
}

// Returns every node for a category as a flat list (id + parentId).
// The frontend already knows how to walk this shape into a tree - see
// FolderSystem.jsx, which was built around exactly this structure.
export const listNodes = asyncHandler(async (req, res) => {
  const { categoryId } = req.query;
  if (!categoryId) throw new ApiError(400, 'categoryId query param is required.');

  const { rows } = await query(
    'SELECT * FROM folder_nodes WHERE user_id = $1 AND category_id = $2 ORDER BY sort_order ASC',
    [req.userId, categoryId]
  );
  res.json({ nodes: rows.map(toPublic) });
});

export const createNode = asyncHandler(async (req, res) => {
  const { categoryId, parentId, type, name } = req.body;
  if (!categoryId || !type || !name) throw new ApiError(400, 'categoryId, type, and name are required.');
  if (!['folder', 'list', 'notepad'].includes(type)) throw new ApiError(400, 'type must be folder, list, or notepad.');

  const { rows: maxRows } = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM folder_nodes WHERE user_id = $1 AND category_id = $2 AND parent_id IS NOT DISTINCT FROM $3',
    [req.userId, categoryId, parentId || null]
  );

  const { rows } = await query(
    `INSERT INTO folder_nodes (user_id, category_id, parent_id, type, name, note, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.userId, categoryId, parentId || null, type, name.trim(), type === 'notepad' ? '' : null, maxRows[0].next]
  );
  res.status(201).json({ node: toPublic(rows[0]) });
});

export const updateNode = asyncHandler(async (req, res) => {
  const { name, note, sortOrder } = req.body;
  const { rows } = await query(
    `UPDATE folder_nodes
     SET name = COALESCE($1, name),
         note = COALESCE($2, note),
         sort_order = COALESCE($3, sort_order)
     WHERE id = $4 AND user_id = $5
     RETURNING *`,
    [name, note, sortOrder, req.params.id, req.userId]
  );
  if (rows.length === 0) throw new ApiError(404, 'Folder node not found.');
  res.json({ node: toPublic(rows[0]) });
});

// Deleting a node cascades to its children AND any tasks that live in it,
// via ON DELETE CASCADE in the schema - no manual cleanup needed here.
export const deleteNode = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM folder_nodes WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rowCount === 0) throw new ApiError(404, 'Folder node not found.');
  res.status(204).end();
});

import { query } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function toPublic(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    colorVar: row.color_var,
    isSystem: row.is_system,
    sortOrder: row.sort_order
  };
}

export const listCategories = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM categories WHERE user_id = $1 ORDER BY sort_order ASC',
    [req.userId]
  );
  res.json({ categories: rows.map(toPublic) });
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, colorVar } = req.body;
  if (!name) throw new ApiError(400, 'name is required.');

  const slug = name.toLowerCase().trim().replace(/\s+/g, '-');
  const { rows: maxRows } = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM categories WHERE user_id = $1',
    [req.userId]
  );

  const { rows } = await query(
    `INSERT INTO categories (user_id, slug, name, color_var, is_system, sort_order)
     VALUES ($1, $2, $3, $4, FALSE, $5) RETURNING *`,
    [req.userId, slug, name.trim(), colorVar || '--purple-dot', maxRows[0].next]
  );
  res.status(201).json({ category: toPublic(rows[0]) });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const { name, colorVar, sortOrder } = req.body;
  const { rows } = await query(
    `UPDATE categories
     SET name = COALESCE($1, name),
         color_var = COALESCE($2, color_var),
         sort_order = COALESCE($3, sort_order)
     WHERE id = $4 AND user_id = $5
     RETURNING *`,
    [name, colorVar, sortOrder, req.params.id, req.userId]
  );
  if (rows.length === 0) throw new ApiError(404, 'Category not found.');
  res.json({ category: toPublic(rows[0]) });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT is_system FROM categories WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) throw new ApiError(404, 'Category not found.');
  if (rows[0].is_system) throw new ApiError(400, 'Built-in categories cannot be deleted.');

  await query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.status(204).end();
});

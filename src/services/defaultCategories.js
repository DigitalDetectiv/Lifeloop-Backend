import { query } from '../db/pool.js';

// Mirrors the frontend's default sidebar categories (see mockData.js).
// Slugs match the frontend's existing category ids exactly (Sidebar.jsx,
// Dashboard.jsx's CATEGORY_PAGES) so tasks/folders resolve to the right
// page without a translation layer. Order here is the sidebar order -
// Todos first, per the product decision to keep it at the top.
const DEFAULT_CATEGORIES = [
  { slug: 'lists', name: 'Todos', colorVar: '--yellow-dot' },
  { slug: 'finance', name: 'Finance', colorVar: '--peach-dot' },
  { slug: 'health', name: 'Health & fitness', colorVar: '--sage-dot' },
  { slug: 'ideas', name: 'Idea vault', colorVar: '--purple-dot' },
  { slug: 'calendar', name: 'Calendar', colorVar: '--blue-dot' },
  { slug: 'journal', name: 'Journal', colorVar: '--pink-dot' }
];

export async function createDefaultCategories(userId) {
  // Parameterized multi-row insert - keeps this safe even though the
  // values are constants today, in case this list ever becomes configurable.
  const params = [];
  const rows = DEFAULT_CATEGORIES.map((c, i) => {
    const base = params.length;
    params.push(userId, c.slug, c.name, c.colorVar, true, i);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });

  const { rows: created } = await query(
    `INSERT INTO categories (user_id, slug, name, color_var, is_system, sort_order)
     VALUES ${rows.join(', ')}
     RETURNING *`,
    params
  );

  return Object.fromEntries(created.map((c) => [c.slug, c]));
}

// Categories are permanent per-user fixtures - re-seeding demo data should
// never try to recreate them, just look up the ones that already exist.
export async function getCategoriesBySlug(userId) {
  const { rows } = await query('SELECT * FROM categories WHERE user_id = $1', [userId]);
  return Object.fromEntries(rows.map((c) => [c.slug, c]));
}

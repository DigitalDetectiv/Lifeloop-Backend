import { query } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { clearUserData, seedDemoData } from '../services/demoData.js';
import { getCategoriesBySlug } from '../services/defaultCategories.js';

export const updateMe = asyncHandler(async (req, res) => {
  const { displayName, darkMode, cardStyle } = req.body;
  if (cardStyle && !['solid', 'glass'].includes(cardStyle)) {
    throw new ApiError(400, "cardStyle must be 'solid' or 'glass'.");
  }

  const { rows } = await query(
    `UPDATE users
     SET display_name = COALESCE($1, display_name),
         dark_mode = COALESCE($2, dark_mode),
         card_style = COALESCE($3, card_style)
     WHERE id = $4
     RETURNING *`,
    [displayName, darkMode, cardStyle, req.userId]
  );
  if (rows.length === 0) throw new ApiError(404, 'User not found.');

  const user = rows[0];
  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      darkMode: user.dark_mode,
      cardStyle: user.card_style
    }
  });
});

// POST /api/users/me/reset-data  { mode: 'demo' | 'empty' }
// Flushes everything the user has created. 'demo' re-seeds the starter
// example data (same as a brand-new account); 'empty' leaves a totally
// clean slate. The account and its categories are never touched.
export const resetData = asyncHandler(async (req, res) => {
  const { mode } = req.body;
  if (!['demo', 'empty'].includes(mode)) throw new ApiError(400, "mode must be 'demo' or 'empty'.");

  await clearUserData(req.userId);
  if (mode === 'demo') {
    const categoriesBySlug = await getCategoriesBySlug(req.userId);
    await seedDemoData(req.userId, categoriesBySlug);
  }
  res.json({ ok: true, mode });
});

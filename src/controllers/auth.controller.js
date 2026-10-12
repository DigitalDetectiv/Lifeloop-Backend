import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import passport from '../config/passport.js';
import { query } from '../db/pool.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createDefaultCategories } from '../services/defaultCategories.js';
import { seedDemoData } from '../services/demoData.js';

const REFRESH_COOKIE_NAME = 'lifeloop_refresh';
// Vercel (frontend) and Render (backend) are different domains once
// deployed, which makes this a genuinely cross-site request. Cookies only
// survive that with sameSite:'none', and browsers only honor 'none' when
// the cookie is also marked secure (HTTPS-only) - which is true in
// production but not in local dev (http://localhost), so this branches
// on environment rather than hardcoding one or the other.
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days, matches JWT_REFRESH_EXPIRES_IN default
};

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueTokens(res, userId) {
  const accessToken = signAccessToken(userId);
  const refreshToken = signRefreshToken(userId);
  const { exp } = verifyRefreshToken(refreshToken);

  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, to_timestamp($3))',
    [userId, hashToken(refreshToken), exp]
  );

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
  return accessToken;
}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    darkMode: user.dark_mode,
    cardStyle: user.card_style
  };
}

export const register = asyncHandler(async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email and password are required.');
  if (password.length < 8) throw new ApiError(400, 'Password must be at least 8 characters.');

  const passwordHash = await bcrypt.hash(password, 12);
  const name = displayName?.trim() || email.split('@')[0];

  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING *`,
    [email.toLowerCase(), passwordHash, name]
  );
  const user = rows[0];
  const categoriesBySlug = await createDefaultCategories(user.id);
  await seedDemoData(user.id, categoriesBySlug);

  const accessToken = await issueTokens(res, user.id);
  res.status(201).json({ accessToken, user: toPublicUser(user) });
});

export const login = asyncHandler(async (req, res, next) => {
  passport.authenticate('local', { session: false }, async (err, user, info) => {
    if (err) return next(err);
    if (!user) return next(new ApiError(401, info?.message || 'Invalid credentials.'));

    const accessToken = await issueTokens(res, user.id);
    res.json({ accessToken, user: toPublicUser(user) });
  })(req, res, next);
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) throw new ApiError(401, 'No refresh token provided.');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new ApiError(401, 'Refresh token is invalid or expired.');
  }

  const tokenHash = hashToken(token);
  const { rows } = await query(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > now()',
    [tokenHash, payload.sub]
  );
  if (rows.length === 0) throw new ApiError(401, 'Refresh token has been revoked.');

  // Rotate: delete the old token, issue a new pair.
  await query('DELETE FROM refresh_tokens WHERE id = $1', [rows[0].id]);
  const accessToken = await issueTokens(res, payload.sub);
  res.json({ accessToken });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (token) {
    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hashToken(token)]);
  }
  res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  res.status(204).end();
});

export const me = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.userId]);
  if (rows.length === 0) throw new ApiError(404, 'User not found.');
  res.json({ user: toPublicUser(rows[0]) });
});

// --- Google OAuth handlers ---

export const googleAuth = passport.authenticate('google', { scope: ['profile', 'email'], session: false });

export const googleCallback = [
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.CLIENT_URL}/login?error=google` }),
  asyncHandler(async (req, res) => {
    const accessToken = await issueTokens(res, req.user.id);
    // Hand the access token back to the frontend via a one-time redirect
    // param; the frontend should immediately store it and strip it from
    // the URL. The refresh token is already set as an httpOnly cookie.
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?accessToken=${accessToken}`);
  })
];

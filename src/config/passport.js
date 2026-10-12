import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import bcrypt from 'bcrypt';
import { query } from '../db/pool.js';
import { createDefaultCategories } from '../services/defaultCategories.js';
import { seedDemoData } from '../services/demoData.js';

// --- Local strategy: email + password ---
passport.use(
  new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
      const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
      const user = rows[0];
      if (!user) {
        return done(null, false, { message: 'NO_ACCOUNT' });
      }
      if (!user.password_hash) {
        // Account exists but was created via Google - there's no password to check.
        return done(null, false, { message: 'GOOGLE_ONLY_ACCOUNT' });
      }

      const matches = await bcrypt.compare(password, user.password_hash);
      if (!matches) {
        return done(null, false, { message: 'WRONG_PASSWORD' });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

// --- Google strategy ---
// Only registered when credentials are present, so the server still boots
// fine in local dev before you've set up a Google OAuth app.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const { rows } = await query('SELECT * FROM users WHERE google_id = $1 OR email = $2', [profile.id, email]);
          let user = rows[0];

          if (!user) {
            const inserted = await query(
              `INSERT INTO users (email, google_id, display_name)
               VALUES ($1, $2, $3) RETURNING *`,
              [email, profile.id, profile.displayName || email.split('@')[0]]
            );
            user = inserted.rows[0];
            const categoriesBySlug = await createDefaultCategories(user.id);
            await seedDemoData(user.id, categoriesBySlug);
          } else if (!user.google_id) {
            // Existing local account signing in with Google for the first time - link it.
            const updated = await query('UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *', [profile.id, user.id]);
            user = updated.rows[0];
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

export default passport;

-- ============================================================================
-- LifeLoop database schema (PostgreSQL)
-- ============================================================================
-- Organized in the same order the app's sidebar is organized, so it's easy
-- to find the tables for a given feature later. Every table that belongs
-- to a user cascades on delete, so removing a user cleans up everything.
--
-- Conventions used throughout:
--   - Primary keys are UUIDs (gen_random_uuid()) so IDs are never guessable
--     and can be created client-side later if needed (e.g. optimistic UI).
--   - created_at / updated_at on every table for auditing + "recently
--     edited" style features later.
--   - Soft, extensible fields (jsonb) are used ONLY where the shape is
--     genuinely open-ended (recurrence rules, journal boxes). Everything
--     else is a real typed column with constraints, so queries stay fast
--     and correct instead of falling back to "put it all in JSON".
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gives us gen_random_uuid()

-- ============================================================================
-- USERS + AUTH
-- ============================================================================

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             CITEXT UNIQUE NOT NULL,       -- requires citext extension (see below)
  password_hash     TEXT,                          -- NULL for Google-only accounts
  google_id         TEXT UNIQUE,                   -- NULL for local-only accounts
  display_name      TEXT NOT NULL,                 -- friendly name shown in greetings
  dark_mode         BOOLEAN NOT NULL DEFAULT FALSE,
  card_style        TEXT NOT NULL DEFAULT 'solid' CHECK (card_style IN ('solid', 'glass')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_auth_method_check CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
);

CREATE EXTENSION IF NOT EXISTS citext; -- case-insensitive email matching

-- Refresh tokens are stored hashed (never plaintext) so a leaked DB dump
-- alone can't be used to mint sessions. One row per issued refresh token;
-- deleting the row (or letting it expire) revokes that session.
CREATE TABLE refresh_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash        TEXT NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- ============================================================================
-- CATEGORIES (sidebar items: Todos, Finance, Health & fitness, Idea vault,
-- Calendar, Journal - plus anything a user creates later)
-- ============================================================================

CREATE TABLE categories (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug              TEXT NOT NULL,                 -- 'todos' | 'finance' | 'health' | 'ideas' | 'calendar' | 'journal' | custom
  name              TEXT NOT NULL,
  color_var         TEXT NOT NULL DEFAULT '--purple-dot',   -- matches the frontend's CSS token names
  is_system         BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE for the 6 built-in categories (can't be deleted, can be recolored)
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, slug)
);

CREATE INDEX idx_categories_user_id ON categories(user_id);

-- ============================================================================
-- FOLDER SYSTEM (the recursive folder/list/notepad tree used by Todos,
-- Finance, Health & fitness, and Idea vault)
-- ============================================================================

CREATE TABLE folder_nodes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id       UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES folder_nodes(id) ON DELETE CASCADE, -- NULL = top-level (root strip)
  type              TEXT NOT NULL CHECK (type IN ('folder', 'list', 'notepad')),
  name              TEXT NOT NULL,
  note              TEXT,                          -- used only when type = 'notepad'
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_folder_nodes_user_id ON folder_nodes(user_id);
CREATE INDEX idx_folder_nodes_category_id ON folder_nodes(category_id);
CREATE INDEX idx_folder_nodes_parent_id ON folder_nodes(parent_id);

-- ============================================================================
-- TASKS (one-time or recurring; belongs either directly to a category, e.g.
-- today's quick-added tasks, or to a 'list'-type folder_node, e.g. items
-- inside "Grocery & shopping")
-- ============================================================================

CREATE TABLE tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id       UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  folder_node_id    UUID REFERENCES folder_nodes(id) ON DELETE CASCADE, -- NULL = lives directly on the category (e.g. Today quick-add)
  title             TEXT NOT NULL,
  scheduled_time    TIME,                          -- e.g. 09:00 for "Pay electricity bill · 9:00 am"
  due_date          DATE,                           -- NULL for recurring tasks (they don't have one fixed date)
  is_recurring      BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule   JSONB,                          -- e.g. {"freq":"daily"} or {"freq":"weekly","days":[1,3,5]}
                                                      -- kept as jsonb deliberately: recurrence patterns are the one
                                                      -- part of this schema likely to grow new shapes over time
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tasks_recurrence_check CHECK (
    (is_recurring = FALSE) OR (is_recurring = TRUE AND recurrence_rule IS NOT NULL)
  )
);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_category_id ON tasks(category_id);
CREATE INDEX idx_tasks_folder_node_id ON tasks(folder_node_id);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- One-time tasks are "done" via this flag directly.
ALTER TABLE tasks ADD COLUMN done BOOLEAN NOT NULL DEFAULT FALSE;

-- Recurring tasks are never "done" forever - they're done *for a given day*.
-- This table decouples the recurring task's definition (in `tasks`) from
-- its daily completion state, so a habit like "drink water" keeps a full
-- history instead of one boolean getting reset and losing the streak.
CREATE TABLE task_completions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_date    DATE NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (task_id, completed_date)
);

CREATE INDEX idx_task_completions_task_id ON task_completions(task_id);
CREATE INDEX idx_task_completions_completed_date ON task_completions(completed_date);

-- ============================================================================
-- FINANCE: To give / To receive ledger
-- ============================================================================

CREATE TABLE ledger_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction         TEXT NOT NULL CHECK (direction IN ('give', 'receive')),
  person            TEXT NOT NULL,
  amount            NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  settled           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_entries_user_id ON ledger_entries(user_id);

-- ============================================================================
-- JOURNAL (one row per user per day; `fields` holds the box contents so
-- adding a new box later - e.g. a "weekly review" field - doesn't need a
-- migration, just a new key in the object)
-- ============================================================================

CREATE TABLE journal_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date        DATE NOT NULL,
  fields            JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- expected keys today: goal, feel, want, habits, improve, mistakes,
  -- joy, grateful, thoughts, tomorrowGoal - enforced in the application
  -- layer, not the DB, so the box list can evolve freely.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, entry_date)
);

CREATE INDEX idx_journal_entries_user_id ON journal_entries(user_id);
CREATE INDEX idx_journal_entries_entry_date ON journal_entries(entry_date);

-- ============================================================================
-- BASIC PASSWORD VAULT (explicitly non-critical logins only, per product
-- decision - see README for the encryption approach)
-- ============================================================================

CREATE TABLE vault_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  username           TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,                -- AES-256-GCM ciphertext, base64
  iv                TEXT NOT NULL,                  -- base64 initialization vector, unique per entry
  auth_tag          TEXT NOT NULL,                  -- base64 GCM auth tag
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vault_entries_user_id ON vault_entries(user_id);

-- ============================================================================
-- updated_at auto-touch trigger (applied to every table that has the column)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_folder_nodes_updated_at BEFORE UPDATE ON folder_nodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_journal_entries_updated_at BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vault_entries_updated_at BEFORE UPDATE ON vault_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

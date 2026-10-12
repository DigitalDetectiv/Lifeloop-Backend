# LifeLoop API

Express + PostgreSQL backend for LifeLoop. Organized by domain (auth,
categories, folder-nodes, tasks, journal, vault, ledger, analytics) so any
one feature can be found, changed, or extended without touching the others.

## Setup

```bash
npm install
cp .env.example .env   # then fill in real values
npm run migrate        # applies src/db/schema.sql to your database
npm run dev            # starts the API with auto-reload on http://localhost:4000
```

You need a Postgres database before `npm run migrate` will work. The
free-hosting plan we picked for this project is **Neon** (neon.tech) -
create a project there, copy its connection string into `DATABASE_URL` in
`.env`, and `npm run migrate` will create every table.

## Folder structure

```
src/
  server.js            entry point
  app.js                Express app: middleware + route mounting
  config/
    passport.js          Passport local + Google strategies
  db/
    schema.sql            full schema, organized by feature
    migrate.js             applies schema.sql
    pool.js                 the pg connection pool
  routes/                 one file per domain, thin - just wires paths to controllers
  controllers/             one file per domain - the actual request handling
  services/                logic that isn't tied to one HTTP request:
                             recurrence matching, vault encryption, default categories
  middleware/               requireAuth (JWT check), errorHandler
  utils/                    jwt helpers, ApiError, asyncHandler
```

**Adding a new feature later**: add one file to each of `routes/`,
`controllers/`, and (if needed) `services/`, following the existing
pattern in any domain - e.g. `ledger.*` is the smallest, simplest example
to copy from. Add any new tables to `schema.sql` and re-run `npm run
migrate` (see the migration note below before you do this in production).

## Auth flow

- `POST /api/auth/register` `{ email, password, displayName? }` → creates
  the user, seeds their 6 default categories, returns an access token
  and sets an httpOnly refresh-token cookie.
- `POST /api/auth/login` `{ email, password }` → same response shape.
- `POST /api/auth/refresh` → reads the refresh cookie, rotates it, returns
  a new access token.
- `POST /api/auth/logout` → revokes the refresh token.
- `GET /api/auth/google` / `GET /api/auth/google/callback` → Google OAuth;
  requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env` (the server
  boots fine without them, Google login just won't be registered).
- `GET /api/auth/me` → current user (requires `Authorization: Bearer <accessToken>`).

The frontend should keep the access token in memory (not localStorage,
to limit XSS exposure) and call `/api/auth/refresh` when a request comes
back 401, then retry once.

## Endpoint reference

| Domain | Endpoints |
|---|---|
| Categories | `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id` |
| Folder nodes | `GET /api/folder-nodes?categoryId=`, `POST /api/folder-nodes`, `PATCH/DELETE /api/folder-nodes/:id` |
| Tasks | `GET /api/tasks/today`, `GET /api/tasks?folderNodeId=`, `POST /api/tasks`, `PATCH /api/tasks/:id`, `POST /api/tasks/:id/toggle`, `DELETE /api/tasks/:id` |
| Journal | `GET /api/journal/:date`, `PUT /api/journal/:date` (date = `YYYY-MM-DD`) |
| Vault | `GET/POST /api/vault`, `POST /api/vault/:id/reveal`, `DELETE /api/vault/:id` |
| Ledger | `GET/POST /api/ledger`, `PATCH/DELETE /api/ledger/:id` |
| Analytics | `GET /api/analytics/today`, `GET /api/analytics/streak` |
| Users | `PATCH /api/users/me` (displayName, darkMode, cardStyle) |

Everything except `/api/auth/*` and `/api/health` requires the
`Authorization: Bearer <accessToken>` header.

## Design notes worth knowing about

- **Recurring tasks never get "done" forever.** A recurring task's
  definition lives in `tasks`; whether it was done *today* lives in
  `task_completions` (one row per task per completed day). This is what
  lets a habit like "drink water" keep a real history/streak instead of
  a single boolean resetting every night. See `services/recurrence.js`
  for how a rule like `{"freq":"weekly","days":[1,3,5]}` gets matched
  against "today."
- **The folder/list/notepad tree** (`folder_nodes`) is self-referencing
  via `parent_id`, exactly matching the frontend's `FolderSystem`
  component, which already expects a flat list of `{id, parentId, type,
  name}` and reconstructs the tree client-side. `GET
  /api/folder-nodes?categoryId=` returns exactly that shape.
- **Journal fields are jsonb on purpose.** The set of boxes (goal, feel,
  mistakes, etc.) is the one part of the product that's still likely to
  change shape. `PUT /api/journal/:date` merges into existing fields
  rather than overwriting the whole day, so the frontend can save one box
  at a time.
- **The password vault is intentionally basic.** The server holds the
  AES-256-GCM key and can decrypt on request - this matches the product
  decision that this vault is for low-sensitivity logins only, not a
  hardened zero-knowledge design. `VAULT_ENCRYPTION_KEY` must be a
  32-byte key, base64-encoded (`openssl rand -base64 32`).

## Migrations

`schema.sql` is a single initial migration - fine for getting started, but
it isn't safely re-runnable once you have real data (it'll error on tables
that already exist, and it has no concept of "add this column to an
existing table"). Before this goes further, it's worth switching to a
real migration tool - `node-pg-migrate` is a light option that fits this
codebase without pulling in a full ORM. Ask me for this when you're ready
and I'll set up incremental migrations instead of one big schema file.

## Deployment (matches the earlier frontend plan)

- **Database**: Neon (free, persistent Postgres)
- **API**: Render free Web Service - set the same env vars from `.env`
  in Render's dashboard, set the start command to `npm start`, and point
  `DATABASE_URL` at Neon.
- **CORS**: set `CLIENT_URL` to your deployed frontend's real URL once
  it's live, not `localhost`.

## Next steps for the AI chatbot

The current `Chatbot` component in the frontend is rule-based (keyword
matching). To make it real:
1. Add an `OPENAI_API_KEY` (or Anthropic key) to `.env`.
2. Add a `POST /api/chat` endpoint that takes the conversation + a snapshot
   of the user's today-tasks (from `GET /api/tasks/today`) and forwards it
   to the LLM with a system prompt describing LifeLoop and what the
   assistant can help with (motivation, summarizing today, maybe creating
   tasks via function calling).
3. Task creation via chat is the natural next step after that - give the
   model a "create_task" tool/function that calls the same logic as
   `POST /api/tasks`.

This is intentionally left out of this pass so auth + core data are solid
first - happy to build it next.

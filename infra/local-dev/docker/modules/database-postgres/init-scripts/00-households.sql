-- households / user_households: per-user pantry partitioning (ADR-008).
--
-- Runs BEFORE 01-pantry-items.sql so the FK from pantry_items.household_id
-- resolves. Init scripts only run on a fresh data volume; alter-table is not
-- needed here. To re-run after a schema change: docker compose down -v && up -d.
--
-- IMPORTANT cross-DB note:
--   created_by / user_id are Supabase auth.users.id values. The Supabase auth
--   schema lives in a SEPARATE Postgres (Supabase cloud), so we cannot add a
--   foreign key here. Treat these columns as opaque UUIDs from the JWT `sub`
--   claim — PowerSync sync rules filter on them via request.user_id().

CREATE TABLE IF NOT EXISTS households (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL DEFAULT 'My Household',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by  UUID         NOT NULL  -- Supabase auth.users.id; no FK (cross-DB)
);

-- user_households: membership join. Conceptually PK(user_id, household_id), but
-- PowerSync's client schema model requires every replicated table to have a
-- single-column UUID `id`. We keep the natural key as a UNIQUE constraint so the
-- membership invariant holds, and add a synthetic surrogate `id` for PowerSync.
-- `role` is forward-looking — v1 doesn't expose role-based UX, but having the
-- column means "owner can kick members" lands without a Postgres migration.
CREATE TABLE IF NOT EXISTS user_households (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL,  -- Supabase auth.users.id; no FK (cross-DB)
  household_id  UUID         NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  role          TEXT         NOT NULL DEFAULT 'member'
                              CHECK (role IN ('owner', 'member')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, household_id)
);

-- Sync rules look up a user's households by user_id; this is the hot path.
CREATE INDEX IF NOT EXISTS idx_user_households_user
  ON user_households (user_id);

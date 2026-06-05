-- household_invites: invite-code mechanism for Shared Household (PR A of 3).
--
-- Runs AFTER 00-households.sql so the FK on household_id resolves, and BEFORE
-- the renamed 03-powersync-publication.sql so the publication picks up this
-- table on first replication. Init scripts only run on a fresh data volume;
-- to re-run after a schema change: docker compose down -v && up -d.
--
-- IMPORTANT cross-DB note:
--   created_by / used_by are Supabase auth.users.id values. The Supabase auth
--   schema lives in a SEPARATE Postgres (Supabase cloud), so we cannot add a
--   foreign key here. Treat these as opaque UUIDs from the JWT `sub` claim.
--
-- Locked decisions (see PR A spec):
--   - Codes are single-use: used_at + used_by become non-null on accept.
--   - 24-hour expiration via column DEFAULT; no background sweeper needed.
--   - invite_code is UNIQUE so the generator can retry on collision.

CREATE TABLE household_invites (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID         NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invite_code   TEXT         NOT NULL UNIQUE,
  created_by    UUID         NOT NULL,  -- Supabase auth.users.id; no FK (cross-DB)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  used_at       TIMESTAMPTZ,
  used_by       UUID                    -- Supabase auth.users.id; null until accepted
);

-- Accept-by-code lookup is the hot path on /household/accept.
CREATE INDEX household_invites_code_idx        ON household_invites(invite_code);
-- Sync stream filters by created_by (users see only invites they created).
CREATE INDEX household_invites_created_by_idx  ON household_invites(created_by);

-- Migration 0007 — announcements + announcement_reactions + push_tokens
-- (Household Announcements feature, July 2026).
--
-- Three new tables: announcements (shopping runs + cooking commitments),
-- announcement_reactions (emoji responses), and push_tokens (per-device Expo
-- push tokens, user-scoped — never visible to co-members).
--
-- run_id on shopping_list_items links list adds to the active shopping run
-- so the runner's screen groups "requested this run" and the batch ping counts.
--
-- Enum-ish columns (kind, status, reaction, platform) are plain TEXT with NO
-- CHECK constraint ON PURPOSE — a DB CHECK the client can violate is the
-- silent-sync-jam class migration 0002 fixed. @breadbox/core zod owns the
-- allowed sets.
--
-- Idempotent: safe to re-run. Lockstep: init-scripts/07-announcements.sql
-- creates these tables for fresh volumes, and the publication script (renumbered
-- to 08-) lists them. The publication ADD below is guarded for live volumes.

CREATE TABLE IF NOT EXISTS announcements (
  id                       UUID         PRIMARY KEY,
  household_id             UUID         NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind                     TEXT         NOT NULL,
  created_by               TEXT         NOT NULL,
  created_at               TIMESTAMPTZ  NOT NULL,
  status                   TEXT         NOT NULL DEFAULT 'active',
  departs_at               TIMESTAMPTZ,
  store_hint               TEXT,
  recipe_id                TEXT,
  recipe_title             TEXT,
  image                    TEXT,
  runner_summary_sent_at   TIMESTAMPTZ,
  updated_at               BIGINT       NOT NULL,
  deleted                  BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_announcements_household_active
  ON announcements (household_id, created_at DESC)
  WHERE deleted = FALSE;

CREATE TABLE IF NOT EXISTS announcement_reactions (
  id               UUID         PRIMARY KEY,
  announcement_id  UUID         NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  household_id     UUID         NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id          TEXT         NOT NULL,
  reaction         TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL,
  updated_at       BIGINT       NOT NULL,
  deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_reactions_announcement
  ON announcement_reactions (announcement_id)
  WHERE deleted = FALSE;

CREATE TABLE IF NOT EXISTS push_tokens (
  id                     UUID     PRIMARY KEY,
  user_id                TEXT     NOT NULL,
  token                  TEXT     NOT NULL,
  platform               TEXT     NOT NULL,
  announcements_enabled  BOOLEAN  NOT NULL DEFAULT TRUE,
  updated_at             BIGINT   NOT NULL,
  deleted                BOOLEAN  NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_tokens_token
  ON push_tokens (token);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON push_tokens (user_id)
  WHERE deleted = FALSE AND announcements_enabled = TRUE;

ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS run_id UUID;

-- Publication adds (explicit allowlist). Guarded so re-running is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'announcements'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE announcements;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'announcement_reactions'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE announcement_reactions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'push_tokens'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE push_tokens;
  END IF;
END $$;

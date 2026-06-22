-- Migration 0004 — favorite_recipes (Favorites + History arc, June 2026).
--
-- Recipes a household has explicitly saved (the heart on Cook This / Recipe
-- Detail) or that surface from cook history. Household-shared + synced and
-- durable across reinstalls — unlike the prior on-device preference weights.
--
-- The full recipe is persisted as a JSON `payload` so a favorite opens in
-- Recipe Detail instantly and offline with NO new recipe-by-id endpoint (the
-- ADR-008/009 NestJS-promotion trigger stays untripped). The denormalized
-- columns drive the favorites LIST without parsing the payload per row.
--
-- Dedupe is by (household_id, recipe_id), enforced in the client query + toggle
-- (un-favorite tombstones; re-favorite un-tombstones) rather than a DB UNIQUE
-- constraint — under-dedupe is the safe failure, and a UNIQUE/CHECK the client
-- can violate is the silent-sync-jam class migration 0002 killed.
--
-- Idempotent: safe to re-run. Lockstep: init-scripts/04-favorite-recipes.sql
-- creates this for fresh volumes, and the publication script (renumbered to
-- 06-) lists it. The publication ADD below is guarded for live volumes.

CREATE TABLE IF NOT EXISTS favorite_recipes (
  id            UUID         PRIMARY KEY,
  household_id  UUID         NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  recipe_id     INTEGER      NOT NULL,
  title         TEXT         NOT NULL,
  image         TEXT,
  ready_minutes INTEGER,
  health_score  INTEGER,
  payload       TEXT         NOT NULL,
  added_by      TEXT         NOT NULL,
  added_at      TIMESTAMPTZ  NOT NULL,
  updated_at    BIGINT       NOT NULL,
  deleted       BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_favorite_recipes_household
  ON favorite_recipes (household_id)
  WHERE deleted = FALSE;

-- The publication is the outer replication wall (explicit allowlist — PR #39).
-- New TABLES need conscious addition; guarded so re-running is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'favorite_recipes'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE favorite_recipes;
  END IF;
END $$;

-- pantry_items: production-shape schema, mirrors @breadbox/core's PantryItem (packages/core/src/schema.ts).
-- This is the table PowerSync replicates from. Walking-skeleton scope:
--   - Last-write-wins via updated_at; no per-device CRDT semantics yet
--   - Single primary key on id (UUID)
--   - Soft delete via deleted = true (not row removal — keeps tombstones for sync propagation)
--   - household_id FKs into households (00-households.sql, runs first)
--
-- LOCKSTEP NOTE: this file describes the CURRENT schema (fresh volumes only).
-- Existing volumes evolve via ../migrations/ (numbered, idempotent — see its
-- README). Changes here MUST ship with a matching migration:
--   - fill_level added by migrations/0001_pantry_items_fill_level.sql
--   - location CHECK dropped by migrations/0002_drop_location_check.sql
--     (custom locations — LocationPicker "+ New" — violated it and silently
--     jammed sync; length/shape guarding is client-side zod, max 40)

CREATE TABLE IF NOT EXISTS pantry_items (
  id           UUID         PRIMARY KEY,
  household_id UUID         NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT         NOT NULL,
  brand        TEXT,
  category     TEXT,
  barcode      TEXT,
  quantity     REAL         NOT NULL DEFAULT 1,
  unit         TEXT,
  location     TEXT         NOT NULL DEFAULT 'pantry',
  added_at     TIMESTAMPTZ  NOT NULL,
  expires_at   TIMESTAMPTZ,
  source       TEXT         NOT NULL
                              CHECK (source IN ('barcode', 'receipt', 'manual', 'restock')),
  added_by     TEXT         NOT NULL,
  updated_at   BIGINT       NOT NULL,  -- epoch ms, mirrors @breadbox/core's PantryItem.updatedAt
  deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
  -- How full the (single, continuous) package is: 1 / 0.75 / 0.5 / 0.25 from
  -- the UI. NULL = not tracked (fill tracking is opt-in per item).
  fill_level   REAL         CONSTRAINT pantry_items_fill_level_range
                              CHECK (fill_level IS NULL OR (fill_level >= 0 AND fill_level <= 1))
);

-- Per-household lookup is the dominant access pattern.
CREATE INDEX IF NOT EXISTS idx_pantry_items_household
  ON pantry_items (household_id)
  WHERE deleted = FALSE;

-- Used by Cook This for expiration-urgency ranking.
CREATE INDEX IF NOT EXISTS idx_pantry_items_expires
  ON pantry_items (expires_at)
  WHERE expires_at IS NOT NULL AND deleted = FALSE;

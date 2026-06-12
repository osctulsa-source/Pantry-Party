-- Migration 0001 — pantry_items.fill_level (fill-level feature).
--
-- How full the (single, continuous) package is: the UI writes 1 / 0.75 /
-- 0.5 / 0.25. NULL = not tracked — the default; fill tracking is opt-in
-- per item, so countable stock (eggs, cans) never carries a meaningless
-- "full" state.
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS; constraint guarded).
-- Lockstep: init-scripts/01-pantry-items.sql includes this column, so FRESH
-- volumes need no migrations — this file is the path for EXISTING volumes.
-- See migrations/README.md for how to apply.

ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS fill_level REAL;

-- Range guard, named so the guard below keeps re-runs no-ops.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pantry_items_fill_level_range'
  ) THEN
    ALTER TABLE pantry_items
      ADD CONSTRAINT pantry_items_fill_level_range
      CHECK (fill_level IS NULL OR (fill_level >= 0 AND fill_level <= 1));
  END IF;
END $$;

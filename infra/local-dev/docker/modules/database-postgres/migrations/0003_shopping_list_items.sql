-- Migration 0003 — shopping_list_items (August shopping-list arc).
--
-- One shared list per household (v1 — multiple named lists would be a later
-- migration). Items are check-off-able and soft-deleted like pantry_items;
-- `source` records how the item got on the list (manual / recipe = what's-
-- missing, restock / low = running-low signals from pips + fill-level).
--
-- Idempotent: safe to re-run. Lockstep: init-scripts/03-shopping-list-items.sql
-- creates this for fresh volumes, and the publication script (renumbered to
-- 04-) lists it. The publication ADD below is guarded for live volumes.

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id           UUID         PRIMARY KEY,
  household_id UUID         NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT         NOT NULL,
  quantity     REAL         NOT NULL DEFAULT 1,
  unit         TEXT,
  note         TEXT,
  checked      BOOLEAN      NOT NULL DEFAULT FALSE,
  source       TEXT         NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('manual', 'recipe', 'restock', 'low')),
  added_by     TEXT         NOT NULL,
  added_at     TIMESTAMPTZ  NOT NULL,
  updated_at   BIGINT       NOT NULL,
  deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_shopping_items_household
  ON shopping_list_items (household_id)
  WHERE deleted = FALSE;

-- The publication is the outer replication wall (explicit allowlist — PR #39).
-- New TABLES need conscious addition; guarded so re-running is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'shopping_list_items'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE shopping_list_items;
  END IF;
END $$;

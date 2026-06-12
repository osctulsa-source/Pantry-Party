-- shopping_list_items: one shared shopping list per household (v1).
-- Mirrors @breadbox/core's ShoppingListItem (packages/core/src/shoppingList.ts).
-- Check-off-able, soft-deleted like pantry_items; `source` records provenance
-- (manual / recipe = what's-missing / restock / low = running-low signals).
--
-- LOCKSTEP: created for existing volumes by migrations/0003_shopping_list_items.sql.
-- Runs BEFORE the publication script (renumbered 04-) — a publication can only
-- list tables that already exist.

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

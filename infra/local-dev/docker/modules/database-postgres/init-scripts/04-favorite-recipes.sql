-- favorite_recipes: recipes a household has saved (Favorites feature).
-- Mirrors @breadbox/core's FavoriteRecipe (packages/core/src/favorites.ts).
-- The full recipe is stored as JSON `payload` for instant + offline Recipe
-- Detail (no recipe-by-id endpoint); denormalized columns drive the list.
--
-- LOCKSTEP: created for existing volumes by migrations/0004_favorite_recipes.sql.
-- Runs BEFORE the publication script (renumbered 06-) — a publication can only
-- list tables that already exist.

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

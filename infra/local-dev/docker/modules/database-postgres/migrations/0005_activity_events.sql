-- Migration 0005 — activity_events (Favorites + History arc, June 2026).
--
-- One append-only activity log per household, powering the History screen and
-- the streak / savings math (streakStats). Graduates the capped on-device logs
-- (cookLog 100, expiryEvents 200) to synced, household-shared, reinstall-
-- durable storage.
--
-- `kind` is the event discriminator (cooked / used / tossed / expired /
-- restocked). It is plain TEXT with NO CHECK constraint ON PURPOSE: a DB CHECK
-- the client can violate is the silent-sync-jam class migration 0002 fixed for
-- `location`. @breadbox/core's ActivityEvent zod owns the allowed set and can
-- grow without a migration.
--
-- Events are immutable; the only mutation is `deleted` (tombstone) so a user
-- can remove a history row. `meta` is optional JSON for kind-specific extras.
--
-- Idempotent: safe to re-run. Lockstep: init-scripts/05-activity-events.sql
-- creates this for fresh volumes, and the publication script (renumbered to
-- 06-) lists it. The publication ADD below is guarded for live volumes.

CREATE TABLE IF NOT EXISTS activity_events (
  id            UUID         PRIMARY KEY,
  household_id  UUID         NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind          TEXT         NOT NULL,
  ref_id        TEXT,
  label         TEXT         NOT NULL,
  quantity      REAL,
  unit          TEXT,
  image         TEXT,
  meta          TEXT,
  occurred_at   TIMESTAMPTZ  NOT NULL,
  added_by      TEXT         NOT NULL,
  updated_at    BIGINT       NOT NULL,
  deleted       BOOLEAN      NOT NULL DEFAULT FALSE
);

-- History is browsed newest-first within a household — composite partial index
-- supports the (household_id, occurred_at DESC) scan.
CREATE INDEX IF NOT EXISTS idx_activity_events_household_time
  ON activity_events (household_id, occurred_at DESC)
  WHERE deleted = FALSE;

-- Conscious publication addition (explicit allowlist — PR #39). Guarded so
-- re-running is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'activity_events'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE activity_events;
  END IF;
END $$;

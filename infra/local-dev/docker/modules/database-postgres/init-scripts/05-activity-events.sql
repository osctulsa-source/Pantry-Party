-- activity_events: one append-only activity log per household (History feature).
-- Mirrors @breadbox/core's ActivityEvent (packages/core/src/activity.ts).
-- Powers the History screen + streak/savings math; graduates the capped
-- on-device cookLog/expiryEvents to synced storage.
--
-- `kind` is plain TEXT (NO CHECK) deliberately — a DB CHECK the client can
-- violate is the silent-sync-jam class migration 0002 fixed for `location`.
-- Core zod owns the allowed set.
--
-- LOCKSTEP: created for existing volumes by migrations/0005_activity_events.sql.
-- Runs BEFORE the publication script (renumbered 06-).

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

CREATE INDEX IF NOT EXISTS idx_activity_events_household_time
  ON activity_events (household_id, occurred_at DESC)
  WHERE deleted = FALSE;

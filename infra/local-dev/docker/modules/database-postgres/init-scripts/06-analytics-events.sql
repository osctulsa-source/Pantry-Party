-- Init 06 — analytics_events (see migrations/0009_analytics_events.sql).
-- Current-schema mirror for fresh Postgres volumes. Not in the powersync
-- publication (write-only telemetry, never synced to devices).

CREATE TABLE IF NOT EXISTS analytics_events (
  id           UUID         PRIMARY KEY,
  install_id   TEXT         NOT NULL,
  user_id      UUID,
  event        TEXT         NOT NULL,
  props        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  TIMESTAMPTZ  NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_time
  ON analytics_events (event, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_install
  ON analytics_events (install_id, occurred_at);

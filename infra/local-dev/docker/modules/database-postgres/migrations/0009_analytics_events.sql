-- Migration 0009 — analytics_events (install → first-match funnel, July 2026).
--
-- Write-only product telemetry. The mobile app best-effort INSERTs one row per
-- funnel event (onboarding_started / staples_seeded / first_match_shown /
-- recipe_opened / cook_this_confirmed) directly via PostgREST — NOT PowerSync.
-- Analytics is fire-and-forget and never synced back to devices, so this table
-- is deliberately ABSENT from the `powersync` publication (init-script 08 is
-- untouched).
--
-- Privacy-first: no PII beyond the authenticated user id (needed for the prod
-- RLS policy) and an anonymous per-install uuid. `event` is plain TEXT with no
-- CHECK — the client's AnalyticsEvent union owns the allowed set (same
-- reasoning as activity_events.kind in migration 0005). `props` is a small
-- JSONB bag.
--
-- Idempotent. Lockstep: init-scripts/06-analytics-events.sql creates this for
-- fresh volumes. RLS is a managed-Supabase concern (applied there separately),
-- intentionally omitted here because dev Postgres has no auth schema.

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

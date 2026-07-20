-- Migration 0008 — add announcements.message (free-text shopping-run note).
--
-- Replaces store_hint as the user-customizable part of the shopping-run
-- notification body. Additive only: store_hint stays in the table (unused
-- by new code) rather than being dropped, since this table is live in prod
-- and a destructive rename carries unnecessary risk for a one-line field.
--
-- Idempotent: safe to re-run.

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS message TEXT;

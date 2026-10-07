-- Migration 0010 — deny-by-default row level security on every public table
-- (October 2026).
--
-- Supabase exposes the `public` schema through PostgREST (/rest/v1) and grants
-- the `anon` and `authenticated` roles table privileges by default. The anon key
-- ships in every app binary, and any signed-up user holds an `authenticated`
-- JWT. With RLS off, those roles could read and write every household's rows
-- directly, bypassing both the PowerSync sync rules and the API upload gate.
--
-- Enabling RLS with NO policies denies those roles entirely, while leaving the
-- real data paths untouched:
--   - services/api connects as `postgres` (table owner, and BYPASSRLS on
--     Supabase) — owners are exempt from non-FORCEd RLS.
--   - PowerSync replicates as `powersync_role`, which is BYPASSRLS.
--   - The account-deletion endpoint's service-role key bypasses RLS.
--   - analytics_events keeps its existing prod-only write-only INSERT policy
--     (see docs/superpowers/plans/2026-07-20-install-to-first-match-p0-p1.md);
--     re-enabling RLS on it is a no-op.
--
-- This is NOT the per-request write-path policy layer ADR-014 defers; it only
-- closes the PostgREST side door. Dynamic over pg_class so it also covers the
-- schema_migrations ledger and any table the repo doesn't know about.
--
-- Idempotent. Lockstep: init-scripts/09-row-level-security.sql applies the same
-- for fresh volumes.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END
$$;

-- Init 09 — deny-by-default row level security (see migrations/0010_rls_deny_public_rest.sql).
-- Current-schema mirror for fresh Postgres volumes. Runs last so it covers every
-- table the earlier init-scripts created (and, under infra/managed/migrate.sh,
-- the schema_migrations ledger too).

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

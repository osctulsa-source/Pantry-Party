-- replication-setup.sql
-- Run against the APP database (pantryparty) on the Azure Flexible Server, as the
-- admin user, AFTER the schema has been created (init-scripts 00..06 / the migration
-- runner). The 'powersync' publication itself is created by init-script
-- 06-powersync-publication.sql -- do NOT recreate it here.
--
-- Pass the role password as a psql variable:
--   psql "<admin connection string>" \
--        -v powersync_repl_password="$PS_REPL_PW" \
--        -f replication-setup.sql

-- 1) Dedicated least-privilege replication role for the PowerSync service.
--    Azure's admin can grant REPLICATION. We deliberately do NOT set BYPASSRLS:
--    Azure Flexible Server has no superuser (so BYPASSRLS cannot be granted), and
--    our tenant isolation lives in PowerSync sync rules + the upload proxy, NOT in
--    Postgres row-level security -- so the replication role has no RLS to bypass.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_repl') THEN
    CREATE ROLE powersync_repl WITH LOGIN REPLICATION PASSWORD :'powersync_repl_password';
  END IF;
END
$$;

-- 2) Read-only access to the published tables (PowerSync only SELECTs the source).
GRANT CONNECT ON DATABASE pantryparty TO powersync_repl;
GRANT USAGE ON SCHEMA public TO powersync_repl;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_repl;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_repl;

-- 3) Verification (expected results in comments).
--    SHOW wal_level;                                            -> logical
--    SELECT pubname FROM pg_publication;                        -> powersync
--    SELECT count(*) FROM pg_publication_tables
--      WHERE pubname = 'powersync';                             -> 7
--    SELECT rolname, rolreplication FROM pg_roles
--      WHERE rolname = 'powersync_repl';                        -> powersync_repl | t

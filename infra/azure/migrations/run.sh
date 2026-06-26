#!/usr/bin/env sh
# =============================================================================
# Migration runner — applies the Pantry Party baseline schema to the private
# Azure PostgreSQL business database, idempotently, then provisions the
# PowerSync replication role.
#
# Idempotency model:
#   - A schema_migrations ledger records which numbered SQL files have run.
#   - Each file is applied at most once, inside a transaction; the filename is
#     recorded on success. Re-running the Job is therefore safe (it no-ops the
#     already-applied files). This matters because 02-household-invites.sql uses
#     bare CREATE TABLE (no IF NOT EXISTS), so it MUST NOT run twice.
#
# Required environment:
#   ADMIN_URI  — postgresql://pgadmin:...@host:5432/<businessdb>?sslmode=require
#   REPL_PASSWORD — password for the powersync_repl role
# =============================================================================
set -eu

: "${ADMIN_URI:?ADMIN_URI is required}"
: "${REPL_PASSWORD:?REPL_PASSWORD is required}"

SQL_DIR="${SQL_DIR:-/migrations/sql}"
PSQL="psql ${ADMIN_URI} -v ON_ERROR_STOP=1 --no-psqlrc --quiet"

echo "==> migration runner starting"
echo "==> target: $(echo "$ADMIN_URI" | sed -E 's#://[^:]+:[^@]+@#://***:***@#')"

# 1. Ensure the ledger exists.
$PSQL <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

# 2. Apply each numbered baseline file once, in lexical order.
for f in "$SQL_DIR"/[0-9][0-9]-*.sql; do
  [ -e "$f" ] || { echo "!! no SQL files found in $SQL_DIR"; exit 1; }
  base="$(basename "$f")"
  already="$($PSQL -tA -c "SELECT 1 FROM schema_migrations WHERE filename = '${base}'")"
  if [ "$already" = "1" ]; then
    echo "==> skip   ${base} (already applied)"
    continue
  fi
  echo "==> apply  ${base}"
  # Apply the file and record it in one transaction: a failure rolls back both.
  psql "${ADMIN_URI}" -v ON_ERROR_STOP=1 --no-psqlrc --quiet --single-transaction \
    -f "$f" \
    -c "INSERT INTO schema_migrations(filename) VALUES ('${base}')"
done

# 3. Provision the PowerSync replication role (idempotent). Not part of the
#    baseline SQL because it needs the injected REPL_PASSWORD and the REPLICATION
#    attribute, which only the admin can grant.
echo "==> provisioning powersync_repl role"
psql "${ADMIN_URI}" -v ON_ERROR_STOP=1 --no-psqlrc --quiet \
  -v repl_pw="$REPL_PASSWORD" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_repl') THEN
    CREATE ROLE powersync_repl WITH LOGIN REPLICATION PASSWORD :'repl_pw';
  ELSE
    ALTER ROLE powersync_repl WITH LOGIN REPLICATION PASSWORD :'repl_pw';
  END IF;
END
$$;

-- GRANT CONNECT needs a literal db name; current_database() resolves it dynamically.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO powersync_repl', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO powersync_repl;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_repl;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_repl;
SQL

# 4. Report the final ledger so the Job logs show what was loaded.
echo "==> schema_migrations ledger:"
$PSQL -c "SELECT filename, applied_at FROM schema_migrations ORDER BY filename"

echo "==> publication tables:"
$PSQL -tA -c "SELECT tablename FROM pg_publication_tables WHERE pubname = 'powersync' ORDER BY tablename"

echo "==> migration runner complete"

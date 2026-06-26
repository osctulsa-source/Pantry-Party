#!/usr/bin/env sh
# Pantry Party DB migration runner (baseline + forward migrations + replication role).
# Idempotent and safe to re-run. Applies, in lexical order:
#   1. /app/baseline/*.sql    the squashed baseline = the repo's init-scripts 00..06
#                             (already includes legacy migrations 0001..0006)
#   2. /app/migrations/*.sql  forward migrations (0007+)
#   3. /app/replication-setup.sql  creates the powersync_repl role (only if PS_REPL_PASSWORD set)
# Applied files are recorded in the schema_migrations ledger and skipped next run.
#
# Required env: PG_URI            admin connection string to the app database
# Optional env: PS_REPL_PASSWORD  password for the powersync_repl role
set -eu

: "${PG_URI:?PG_URI is required}"

psql_run() { psql "$PG_URI" -v ON_ERROR_STOP=1 -X -q "$@"; }

echo "==> ensuring schema_migrations ledger"
psql_run -c "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());"

apply_file() {
  f="$1"
  v="$(basename "$f")"
  sum="$(sha256sum "$f" | cut -d' ' -f1)"
  already="$(psql_run -t -A -c "SELECT 1 FROM schema_migrations WHERE version = '${v}';")"
  if [ "$already" = "1" ]; then
    echo "    skip ${v} (already applied)"
    return 0
  fi
  echo "==> applying ${v}"
  psql "$PG_URI" -v ON_ERROR_STOP=1 -X -q --single-transaction -f "$f"
  psql_run -c "INSERT INTO schema_migrations (version, checksum) VALUES ('${v}', '${sum}');"
  echo "    done ${v}"
}

echo "==> baseline"
for f in $(ls /app/baseline/*.sql 2>/dev/null | sort); do apply_file "$f"; done

echo "==> forward migrations"
for f in $(ls /app/migrations/*.sql 2>/dev/null | sort); do apply_file "$f"; done

if [ -n "${PS_REPL_PASSWORD:-}" ]; then
  echo "==> replication role (powersync_repl)"
  psql "$PG_URI" -v ON_ERROR_STOP=1 -X -q -v powersync_repl_password="$PS_REPL_PASSWORD" -f /app/replication-setup.sql
else
  echo "==> skipping replication role (PS_REPL_PASSWORD not set)"
fi

echo "==> current schema_migrations:"
psql_run -c "SELECT version, applied_at FROM schema_migrations ORDER BY version;"
echo "==> migration runner complete"

#!/usr/bin/env sh
# =============================================================================
# Canonical schema migration runner for the managed production database
# (Supabase Postgres). Host-agnostic — the ledger model is lifted from the
# parked infra/azure/migrations/run.sh, minus the Azure-only role provisioning
# (the managed stack's powersync_role is documented in infra/managed/README.md).
#
# Ledger model:
#   - A schema_migrations table records which numbered SQL files have run.
#   - Each file is applied at most once, inside a single transaction; the
#     filename is recorded on success. Re-running is therefore safe.
#   - Files are applied in two ordered passes: the init-scripts baseline
#     (00-08, current schema for a fresh database) then the numbered migrations
#     (0001-0009, the incremental path for existing databases). Migrations are
#     idempotent (ADD COLUMN IF NOT EXISTS, guarded DO blocks), so on a fresh
#     database they no-op after the baseline; the ledger keeps them one-shot.
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host:5432/db ./infra/managed/migrate.sh
#
# This is the documented pre-deploy step: run it against production BEFORE a
# services/api / PowerSync deploy that depends on new schema. It is also the
# runner the CI "migrations apply cleanly" check invokes against a fresh
# Postgres (see .github/workflows/ci.yml).
# =============================================================================
set -eu

: "${DATABASE_URL:?DATABASE_URL is required (postgres://…)}"

# Resolve the schema dir relative to this script so it works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_MODULE="${SCRIPT_DIR}/../local-dev/docker/modules/database-postgres"
INIT_DIR="${DB_MODULE}/init-scripts"
MIGRATIONS_DIR="${DB_MODULE}/migrations"

PSQL="psql ${DATABASE_URL} -v ON_ERROR_STOP=1 --no-psqlrc --quiet"

redacted="$(echo "$DATABASE_URL" | sed -E 's#://[^:]+:[^@]+@#://***:***@#')"
echo "==> migration runner starting"
echo "==> target: ${redacted}"

# 1. Ensure the ledger exists.
$PSQL <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

# 2. Apply each numbered file once, in order: baseline first, then migrations.
apply_dir() {
  dir="$1"
  glob="$2"
  for f in "$dir"/$glob; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"
    already="$($PSQL -tA -c "SELECT 1 FROM schema_migrations WHERE filename = '${base}'")"
    if [ "$already" = "1" ]; then
      echo "==> skip   ${base} (already applied)"
      continue
    fi
    echo "==> apply  ${base}"
    # Apply the file and record it in ONE transaction: a failure rolls back both.
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 --no-psqlrc --quiet --single-transaction \
      -f "$f" \
      -c "INSERT INTO schema_migrations(filename) VALUES ('${base}')"
  done
}

apply_dir "$INIT_DIR" '[0-9][0-9]-*.sql'
apply_dir "$MIGRATIONS_DIR" '[0-9][0-9][0-9][0-9]_*.sql'

# 3. Report the final ledger + published tables so deploy logs show the state.
echo "==> schema_migrations ledger:"
$PSQL -c "SELECT filename, applied_at FROM schema_migrations ORDER BY filename"

echo "==> publication tables:"
$PSQL -tA -c "SELECT tablename FROM pg_publication_tables WHERE pubname = 'powersync' ORDER BY tablename"

echo "==> migration runner complete"

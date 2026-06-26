# Database migrations (production / Azure)

A tiny, dependency-free migration runner: **bash + `psql` + a `schema_migrations` ledger**.
No ORM, no migration framework. It runs as a **Container Apps Job inside the VNet**, which is
the only thing that can reach the private Flexible Server.

## Model

The runner applies SQL files in this order, each recorded in `schema_migrations` and skipped
on subsequent runs:

1. **Baseline** — `infra/local-dev/docker/modules/database-postgres/init-scripts/00..06`.
   This is the complete current schema (all 7 tables + the `powersync` publication) and it
   already folds in legacy dev migrations `0001–0006` (kept in lockstep in the init-scripts),
   so those are **not** re-run in production.
2. **Forward migrations** — `infra/azure/migrations/sql/0007_*.sql` and up, lexical order.
3. **Replication role** — `infra/azure/replication-setup.sql` creates `powersync_repl`
   (only when `PS_REPL_PASSWORD` is set). Idempotent.

The ledger: `schema_migrations(version text pk, checksum text, applied_at timestamptz)`.
`version` is the file name. Everything is idempotent and safe to re-run.

## Adding a migration

1. Create `infra/azure/migrations/sql/0007_short_description.sql`. Make it idempotent.
   Follow the project's two-file discipline for synced tables (also add it to the relevant
   init-script and `ALTER PUBLICATION powersync ADD TABLE ...` with a guard).
2. Rebuild the runner image and re-run the Job (see `MIGRATIONS-DEPLOY.md`):
   ```
   az acr build -r <acr> -t pantryparty-migrate:latest -f infra/azure/migrations/Dockerfile .
   az containerapp job start -g <rg> -n <job>
   ```
   Only the new file applies; everything already in the ledger is skipped.

## Notes

- Future production migrations start at **0007** (0000–0006 are the baseline).
- If the baseline ever fails on a `CREATE EXTENSION`, add that extension to the server's
  `azure.extensions` parameter and re-run — Azure gates extensions by allowlist.
- This runner now owns schema for prod. Local dev can keep using the Docker init-scripts; if
  the two ever drift, the init-scripts (baseline) remain the source of truth.

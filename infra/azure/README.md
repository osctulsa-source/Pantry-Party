# Azure database foundation (Phase 1)

> **⚠ PARKED (2026-07-02).** Production moved to the managed stack — Supabase +
> PowerSync Cloud + Railway; see [`infra/managed/README.md`](../managed/README.md)
> and ADR-007. The Azure subscription was offer-constrained (region-restricted
> Postgres, ACR Tasks blocked, Container Apps capacity walls) and the
> `rg-pantryparty-prod-westus3` resource group has been deleted. This IaC and
> the PR #142 branch remain as a revivable reference; do not treat them as the
> active deploy path.

The private data tier for Pantry Party: a VNet-isolated PostgreSQL Flexible
Server that PowerSync replicates from, provisioned as infrastructure-as-code and
seeded by a Container Apps migration Job (no laptop-to-DB connection — the server
has no public IP).

## File map

| File | Role |
|---|---|
| [`main.bicep`](./main.bicep) | VNet + private Postgres (2 DBs, `wal_level=logical`) + Key Vault + observability + budget |
| [`platform.bicep`](./platform.bicep) | ACR + user-assigned identity + Container Apps environment (VNet-joined) |
| [`job-migrations.bicep`](./job-migrations.bicep) | Manually-triggered Container Apps Job that runs the migration runner |
| [`migrations/Dockerfile`](./migrations/Dockerfile) | Runner image (`postgres:16-alpine` + baseline SQL + runner) |
| [`migrations/run.sh`](./migrations/run.sh) | Idempotent runner: ledger-gated baseline + `powersync_repl` role |

The **baseline schema** is the same `00`–`06` init-scripts the local-dev Docker
Postgres loads
([`infra/local-dev/docker/modules/database-postgres/init-scripts/`](../local-dev/docker/modules/database-postgres/init-scripts/)) —
they describe the current schema, so a fresh cloud DB needs exactly these.

## Run order

1. [`DEPLOY.md`](./DEPLOY.md) — steps 1–6: deploy `main.bicep`, restart for `wal_level`.
2. [`MIGRATIONS-DEPLOY.md`](./MIGRATIONS-DEPLOY.md) — steps 7–11: platform, build image, deploy + run the Job.

When the Job reports success the DB is PowerSync-ready and Phase 2 (PowerSync +
API on the same Container Apps environment) is unblocked.

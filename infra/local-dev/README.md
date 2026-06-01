# Local development environment

A Docker Compose stack that runs PowerSync + Postgres entirely on your machine. This is what the Phase 1 walking skeleton (and any day-to-day local development) runs against — no cloud accounts required, no monthly bills.

## Why this exists

ADR-003 chose PowerSync as the sync engine. ADR-007 defers the production Postgres hosting decision until deploy time. Until then, this stack carries every development workflow:

- Self-hosted PowerSync instance on :8080
- Source Postgres (the database PowerSync replicates from)
- Storage Postgres (PowerSync's internal bucket storage)
- `init-scripts/` seeds the `pantry_items` table with the composite primary key the merge model relies on

## Usage

```sh
cd infra/local-dev
docker compose -f docker/docker-compose.yaml up -d   # start
docker compose -f docker/docker-compose.yaml down    # stop
```

Then point your local app at http://localhost:8080 (configured via env vars — see `apps/mobile/.env.example` once the walking skeleton lands).

## What's in here

- `service.yaml`, `sync-config.yaml`, `cli.yaml` — PowerSync instance config (what data to sync, how clients authenticate, etc.)
- `docker/docker-compose.yaml` — the three-service stack
- `docker/modules/database-postgres/init-scripts/` — DDL the source Postgres runs on first boot (`pantry_items` table + replication publication)
- `docker/modules/storage-postgres/init-scripts/` — DDL the storage Postgres runs on first boot
- `docker/.env` — local-only secrets (gitignored; regenerate from PowerSync's `powersync generate token` when JWTs expire)

## When this gets replaced

When we're ready to deploy or invite external users, we revisit ADR-007 and pick a production Postgres host (Supabase, Neon, RDS, or stay on this stack at production scale). The app code doesn't change — only the connection target does.

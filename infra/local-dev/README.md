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

## macOS dev setup gotcha — Docker file sharing

If your repo is checked out outside Docker Desktop's default shared paths
(`/Users`, `/private`, `/tmp`), the bind mounts in `docker/docker-compose.yaml`
silently present as empty directories inside the containers. Symptoms:

- `pg-db` starts but `pantry_items` doesn't exist (init scripts never ran —
  `/docker-entrypoint-initdb.d/` is empty inside the container).
- `powersync` is stuck in a restart loop with `EISDIR: cannot read
  /config/service.yaml` (the file mounts as an empty directory instead).

**Fix:** Docker Desktop → Settings → Resources → File Sharing → under
**Virtual file shares** (NOT "Synchronized file shares" — that's a paid
feature you don't need) → click `+` → add the repo's parent path. For paths
under `/Volumes/...`, adding `/Volumes` once covers all subdirectories.
Apply & Restart, then `docker compose down -v && up -d` to reset volumes
so init scripts re-run.

One-time per-machine setting. Not needed if your repo lives under `~/`
(already shared by default). Not relevant on Linux / Windows hosts.

## Port mapping note

The compose file separates host port (configurable via `PS_PORT` in `docker/.env`,
default `8080`) from PowerSync's container-internal port (always `8080`). Avoid
setting `PS_PORT=8081` — that's Expo Metro's default and they'll collide the
moment you `npx expo start`.

## What's in here

- `service.yaml`, `sync-config.yaml`, `cli.yaml` — PowerSync instance config (what data to sync, how clients authenticate, etc.)
- `docker/docker-compose.yaml` — the three-service stack
- `docker/modules/database-postgres/init-scripts/` — DDL the source Postgres runs on first boot (`pantry_items` table + replication publication)
- `docker/modules/storage-postgres/init-scripts/` — DDL the storage Postgres runs on first boot
- `docker/.env` — local-only secrets (gitignored; regenerate from PowerSync's `powersync generate token` when JWTs expire)

## When this gets replaced

When we're ready to deploy or invite external users, we revisit ADR-007 and pick a production Postgres host (Supabase, Neon, RDS, or stay on this stack at production scale). The app code doesn't change — only the connection target does.

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
docker compose -f docker/docker-compose.yaml up -d           # start
docker compose -f docker/docker-compose.yaml down            # stop
docker compose -f docker/docker-compose.yaml down -v         # stop AND wipe volumes (re-run init scripts on next up)
docker compose -f docker/docker-compose.yaml restart powersync   # reload service.yaml / docker/.env without rebuilding
```

Then point your local app at http://localhost:8080 (configured via env vars — see `apps/mobile/.env.example`).

## First-time setup

1. Copy `docker/.env.example` → `docker/.env` and fill in `PS_SUPABASE_JWKS_URI` (see below).
2. Copy `apps/mobile/.env.example` → `apps/mobile/.env.local` and fill in `EXPO_PUBLIC_SUPABASE_*`.
3. `docker compose -f docker/docker-compose.yaml up -d`

## Authentication (Supabase JWT handoff)

The mobile client signs in with Supabase, then forwards the resulting access token to PowerSync as the bearer credential (`apps/mobile/src/data/powersync/db.ts`). PowerSync validates the JWT against the Supabase project's JWKS endpoint (asymmetric ES256). The token's `sub` claim becomes `auth.user_id()` in `sync-config.yaml`, and the sync rules use it to filter pantry data per household membership.

To configure:

1. Find your Supabase project ref (the subdomain of `EXPO_PUBLIC_SUPABASE_URL` — e.g. `https://abcd1234.supabase.co` → `abcd1234`).
2. In `docker/.env`, set:
   ```
   PS_SUPABASE_JWKS_URI=https://abcd1234.supabase.co/auth/v1/.well-known/jwks.json
   ```
3. `docker compose -f docker/docker-compose.yaml restart powersync` to pick up the change.

If PowerSync logs report "audience mismatch" or "unsupported algorithm," paste a decoded session token at jwt.io and confirm `aud: authenticated` and `alg: ES256`. Don't iterate blindly on auth configs — paste `docker compose logs powersync --tail 50` and debug from there.

## Smoke test: per-user isolation

On a single iOS simulator, sign in / sign out is enough to prove the sync filter:

1. Reset state: `docker compose -f docker/docker-compose.yaml down -v && up -d` (drops volumes so init scripts re-run cleanly).
2. Launch the app. Sign in as user A.
3. Get user A's Supabase user id (Supabase Dashboard → Authentication → Users, copy the `id` UUID).
4. Direct Postgres insert (the mobile client can't write yet — Add Item lands in PR #8):
   ```sh
   docker compose -f docker/docker-compose.yaml exec pg-db psql -U postgres -d postgres -c "
     INSERT INTO households (created_by) VALUES ('<user-a-uuid>') RETURNING id;
   "
   # Use the returned household_id below.
   docker compose -f docker/docker-compose.yaml exec pg-db psql -U postgres -d postgres -c "
     INSERT INTO user_households (user_id, household_id, role)
     VALUES ('<user-a-uuid>', '<household-id>', 'owner');
     INSERT INTO pantry_items (id, household_id, name, quantity, unit, location, added_at, source, added_by, updated_at)
     VALUES (gen_random_uuid(), '<household-id>', 'Test eggs', 12, 'ct', 'fridge', NOW(), 'manual', 'smoke-test', (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT);
   "
   ```
5. Pull-to-refresh in the app — 'Test eggs' should appear.
6. Sign out. Local SQLite is wiped automatically (see `disconnectAndClearPowerSync` in `AuthContext`).
7. Sign in as user B (different Supabase user). Pantry is empty. Isolation confirmed.

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
- `docker/modules/database-postgres/init-scripts/` — DDL the source Postgres runs on first boot (`00-households`, `01-pantry-items`, `02-powersync-publication`)
- `docker/modules/storage-postgres/init-scripts/` — DDL the storage Postgres runs on first boot
- `docker/.env` — local-only config (gitignored — template at `docker/.env.example`). Contains the Supabase JWKS URI for client auth.

## When this gets replaced

When we're ready to deploy or invite external users, we revisit ADR-007 and pick a production Postgres host (Supabase, Neon, RDS, or stay on this stack at production scale). The app code doesn't change — only the connection target does.

# Local development environment

This Docker Compose environment mirrors the production data path without using PowerSync
Cloud, Railway, or the production database. Supabase is still used for Auth/JWKS identity.

## Services

| Service | Default host port | Responsibility |
|---|---:|---|
| `pg-db` | internal | Source-of-truth Postgres with the application schema |
| `pg-storage` | internal | PowerSync's internal bucket/checkpoint storage |
| `powersync` | `8080` | Local sync service using `service.yaml` and `sync-config.yaml` |
| `api` | `8090` | NestJS API, including the legacy Express routers under migration |

The source database baseline creates the ten PowerSync-published application tables plus
the server-only `analytics_events` table. The PowerSync client syncs **10 tables across 4
streams**; see `sync-config.yaml`.

The local `pantry_items` schema intentionally matches current production behavior: one UUID
row and `updated_at` last-write-wins. It does not yet implement the proposed per-device
quantity contribution model (ADR-011).

## First-time setup

1. Copy `docker/.env.example` to `docker/.env`.
2. Set `PS_SUPABASE_JWKS_URI` to your Supabase project's JWKS URL:

   ```text
   https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
   ```

3. Add the server-only Spoonacular and optional Sentry values in `docker/.env`.
4. Copy `../../apps/mobile/.env.example` to `../../apps/mobile/.env.local` and provide the
   Supabase URL/anon key. Keep the default local PowerSync and API URLs when the simulator
   can reach the host as `localhost`.
5. Start the stack:

   ```sh
   docker compose -f docker/docker-compose.yaml up -d
   ```

The mobile client signs in with Supabase and forwards that access token to PowerSync and the
API. The JWT `sub` becomes `auth.user_id()` in the sync rules.

## Daily commands

```sh
cd infra/local-dev

docker compose -f docker/docker-compose.yaml up -d
docker compose -f docker/docker-compose.yaml ps
docker compose -f docker/docker-compose.yaml logs -f powersync api
docker compose -f docker/docker-compose.yaml restart powersync
docker compose -f docker/docker-compose.yaml down

# Destructive: remove local database volumes and rerun all init scripts next start
docker compose -f docker/docker-compose.yaml down -v
```

Health checks:

```sh
curl http://localhost:8080/probes/liveness
curl http://localhost:8090/health
```

Avoid `PS_PORT=8081`; Expo Metro uses that port by default.

## Schema lifecycle

- `docker/modules/database-postgres/init-scripts/` is the current baseline for a fresh
  Postgres volume.
- `docker/modules/database-postgres/migrations/` evolves existing local and managed
  databases through numbered, idempotent migrations.
- `08-powersync-publication.sql` explicitly lists the ten published tables. It is not `FOR
  ALL TABLES`; a new synced table requires deliberate publication and sync-rule changes.
- `sync-config.yaml` is the source of truth for the four household/user-scoped streams and
  is also deployed to PowerSync Cloud.

When changing replicated data, update the baseline, add a migration, update the PowerSync
client schema, update the publication if a table is added, and update sync rules together.

## Smoke test: upload, download, and isolation

1. Start the stack and launch a development build of the mobile app.
2. Sign in as user A. The app creates a default household locally; the PowerSync connector
   uploads the household and membership through `/sync/upload`.
3. Add an item while online and verify it appears in `pg-db`.
4. Disable the device network, add another item, then restore connectivity. Verify the
   queued write reaches Postgres and remains visible after an app restart.
5. Sign out. The app disconnects and clears local PowerSync data.
6. Sign in as user B. User A's household data must not appear.

Useful database check:

```sh
docker compose -f docker/docker-compose.yaml exec pg-db \
  psql -U "$PS_DATABASE_USER" -d "$PS_DATABASE_NAME" \
  -c "SELECT id, household_id, name, updated_at FROM pantry_items WHERE deleted = FALSE;"
```

## Docker Desktop file sharing on macOS

If the repository lives outside Docker Desktop's default shared paths, bind mounts may
appear empty. Typical symptoms are missing tables or PowerSync treating mounted YAML files
as directories.

Add the repository's parent under Docker Desktop → Settings → Resources → File Sharing,
restart Docker, then recreate volumes with `docker compose ... down -v` and `up -d`. This is
not normally needed on Windows, Linux, or repositories under the macOS home directory.

## Relationship to production

Production is already resolved and deployed as Supabase Postgres/Auth + PowerSync Cloud +
Railway (ADR-007). This local stack is the development equivalent, not a placeholder for an
undecided host. See [`../managed/README.md`](../managed/README.md) for provisioning and
verification details.
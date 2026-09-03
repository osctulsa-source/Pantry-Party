# Managed production stack (Supabase + PowerSync Cloud + Railway)

The production backend, resolved 2026-07-02 (ADR-007). Everything is a managed
service; there is no IaC to apply — this file is the runbook that documents how
the stack was provisioned and how to re-create or evolve it.

```
mobile app ──auth──────────────► Supabase Auth   (one project: yclvepnvoisgprqcenvj)
mobile app ──sync download─────► PowerSync Cloud ──logical replication──► Supabase Postgres
mobile app ──writes + recipes──► services/api on Railway ──Supavisor session pooler──► Supabase Postgres
```

| Piece | Where | URL |
|---|---|---|
| Postgres + Auth | Supabase project `yclvepnvoisgprqcenvj` | `https://yclvepnvoisgprqcenvj.supabase.co` |
| Sync service | PowerSync Cloud instance `6a19dc178d064eb85eea1728` | `https://6a19dc178d064eb85eea1728.powersync.journeyapps.com` |
| API (`services/api`) | Railway project `pantry-party`, service `api` | `https://api-production-f3c5.up.railway.app` |

The Azure path (`infra/azure/`, PR #142) is **parked** — see ADR-007.

## 1 · Supabase (Postgres + Auth)

The SAME Supabase project serves app auth (anon key), PowerSync's JWKS, and the
API's `API_JWKS_URI`. Two connection paths — do not cross them:

- **PowerSync → Supabase**: the DIRECT endpoint (`db.<ref>.supabase.co:5432`).
  Logical replication does not work through the pooler. The direct endpoint is
  IPv6-only unless the **IPv4 add-on** is enabled (it is — required for
  PowerSync Cloud).
- **API → Supabase**: the **session-mode Supavisor pooler**
  (`aws-1-us-west-2.pooler.supabase.com:5432`, user `postgres.<ref>`) — IPv4,
  long-lived pool friendly.

Schema: the numbered baseline + migrations from
`infra/local-dev/docker/modules/database-postgres/` (init-scripts `00`–`06`,
then `migrations/0001`–`0006`), applied idempotently with a
`schema_migrations` ledger — same model as `infra/azure/migrations/run.sh`, run
via `psql` in a `postgres:16-alpine` container against the direct endpoint.
This produced the 7 tables, the `powersync` publication over exactly those
tables, and the replication role per PowerSync's Supabase guide:

```sql
CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD '<generated>';
GRANT USAGE ON SCHEMA public TO powersync_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;
```

RLS is intentionally NOT enabled — tenancy lives in the sync rules (reads) and
the API upload-proxy (writes). Ignore Supabase's RLS-linter warnings.

## 2 · PowerSync Cloud

Instance is managed with the `powersync` CLI (`npm i -g powersync`, then
`powersync login`):

```sh
powersync pull instance --instance-id=6a19dc178d064eb85eea1728 --directory pulled
# edit pulled/service.yaml + pulled/sync-config.yaml, then
PS_ROLE_PASSWORD=<powersync_role pw> powersync deploy --directory pulled
powersync fetch status --directory pulled   # connected + replicating, 7 tables
```

- `service.yaml`: postgres connection to the DIRECT Supabase endpoint as
  `powersync_role`, `sslmode: verify-full`, and `client_auth: { supabase: true }`
  (the project uses modern asymmetric JWT signing keys, so PowerSync
  auto-configures JWKS; no legacy secret).
- `sync-config.yaml`: byte-for-byte the repo's
  [`infra/local-dev/sync-config.yaml`](../local-dev/sync-config.yaml) (edition-3
  sync streams, household-scoped via `auth.user_id()`). That file remains the
  source of truth — deploy it after any change.

## 3 · API on Railway

`services/api` deploys from its own directory (the Dockerfile's build context):

```sh
railway up services/api --path-as-root --service api --detach
railway domain --service api --port 8090
```

Environment (service `api`):

| Var | Value |
|---|---|
| `PG_URI` | Supabase SESSION-mode pooler URI (see §1; password URL-encoded) |
| `API_JWKS_URI` | `https://yclvepnvoisgprqcenvj.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL` | `https://yclvepnvoisgprqcenvj.supabase.co` (API reads both) |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key (account deletion endpoint) |
| `SPOONACULAR_API_KEY` | recipe search |
| `SENTRY_DSN` | optional; unset = reporting disabled |
| `API_PORT` | `8090` (the generated domain targets 8090) |
| `NODE_ENV` | `production` |

Deployability notes (fixed in this PR): `services/api/tsconfig.json` must stay
self-contained (a fresh container build has no repo root, so an `extends` above
`services/api/` silently loses `experimentalDecorators` and NestJS dies at
boot), and `express` must stay on v5 — `@nestjs/platform-express` 11 wraps the
provided Express instance and reads `app.router`, which throws on Express 4.

### Scaling & single-instance invariants

**The `api` service MUST run exactly one replica (Railway replicas = 1).** Two
pieces of state live in-process, not in a shared store:

- `FixedWindowRateLimiter` (`src/lib/rateLimit.ts`) — the Spoonacular per-user
  quota. At N replicas the effective limit is N× the configured value.
- `TtlCache` (`src/lib/ttlCache.ts`) — the 24h recipe-search cache. Each replica
  keeps its own, so cache hit-rate (and quota savings) degrades with replicas.

The runner-summary sweep (`sweepRunnerSummaries`) is already multi-instance safe:
it claims each run with `UPDATE announcements SET runner_summary_sent_at = NOW()
WHERE id = $1 AND runner_summary_sent_at IS NULL` and only sends when `rowCount =
1`, so overlapping ticks can't double-send. It is the exception, not the rule.

**Before raising the replica count**, move the rate limiter and cache to a shared
store (Redis or a Postgres table). Until then, keep replicas pinned to 1 in the
Railway service settings.

## 4 · Mobile app

Pure config; no code changes. `apps/mobile/.env.local` (dev) and the
per-profile `env` blocks in `apps/mobile/eas.json` (EAS builds ignore
`.env.local`) carry the full `EXPO_PUBLIC_*` set:

```
EXPO_PUBLIC_POWERSYNC_URL=https://6a19dc178d064eb85eea1728.powersync.journeyapps.com
EXPO_PUBLIC_API_URL=https://api-production-f3c5.up.railway.app
EXPO_PUBLIC_SUPABASE_URL=https://yclvepnvoisgprqcenvj.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

`EXPO_PUBLIC_*` values are bundled at BUILD time: rebuild (or `expo start -c`)
after changing them. No trailing slash on the URLs.

## 5 · Verification

Server-side E2E (ran 2026-07-02, all green): Supabase admin-created test user →
password sign-in → `POST /sync/upload` (household + membership + pantry item;
JWKS auth + tenancy + pooler write) → PowerSync `write-checkpoint2.json` 200
with the same JWT → `POST /sync/stream` returned all three rows (replication +
sync rules). Plus `/health` = 200 and 401s on unauthenticated writes.

Device-level: sign in on the app → household data streams down → offline edit
drains via `/sync/upload` → recipe search returns results.

## Secrets

Secret values live in the developer's gitignored `.env` files and the SaaS
dashboards (Supabase project settings, PowerSync instance config, Railway
service variables). The Azure Key Vault copy died with the Azure teardown.

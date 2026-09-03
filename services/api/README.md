# @breadbox/api

The production API is Node.js + TypeScript on NestJS, deployed to Railway. It currently
uses an incremental migration architecture: NestJS wraps an Express application so tested
legacy routers can move to native Nest modules without a flag-day HTTP rewrite (ADR-009).

## HTTP surface

| Method and path | Implementation | Purpose |
|---|---|---|
| `GET /health` | Express bootstrap | Unauthenticated liveness probe |
| `POST /sync/upload` | Legacy Express router | Apply the PowerSync client CRUD queue |
| `POST /household/invite` | Legacy Express router | Create a household invite |
| `POST /household/accept` | Legacy Express router | Accept an invite and create membership |
| `POST /recipes/search` | Legacy Express router | Validate, rate-limit, cache, and proxy Spoonacular search |
| `DELETE /account` | NestJS `AccountModule` | Delete the authenticated account and associated data |
| `GET /recipes/:id/instructions` | NestJS `RecipesModule` | Backfill recipe instructions |

All endpoints except `/health` require a Supabase access token. `src/middleware/auth.ts`
validates tokens against `API_JWKS_URI`.

## Architecture boundary

`src/main.ts` is the only runtime entrypoint. It:

1. loads Sentry instrumentation before HTTP/database libraries;
2. creates the underlying Express server and mounts the legacy routers;
3. wraps that server with NestJS's `ExpressAdapter` and `AppModule`;
4. installs error reporting for both routing systems;
5. starts an idempotent scheduled sweep for shopping-runner summaries.

New endpoints are NestJS-first. Migrate a legacy router when its feature is next changed,
while keeping its wire contract and tests stable. `src/index.ts` is a retired pre-promotion
entrypoint retained only as migration history; package scripts run `src/main.ts`.

The API is stateless. Durable state belongs in Postgres; process-local recipe caches and
rate limits are opportunistic and reset on restart.

## Responsibilities and security

- Drain PowerSync uploads and enforce table/operation allowlists.
- Derive identity from the validated JWT, then enforce household membership/ownership.
- Keep `PG_URI`, `SUPABASE_SERVICE_ROLE_KEY`, and `SPOONACULAR_API_KEY` server-side.
- Proxy paid/secret partner APIs so keys never enter the mobile bundle.
- Fan out Expo push notifications and tombstone invalid device tokens.
- Report errors to Sentry when `SENTRY_DSN` is configured.

PowerSync sync rules protect downloads; API authorization protects writes. Both layers are
required. Do not trust client-provided user IDs or household IDs without membership checks.

## Environment

| Variable | Purpose |
|---|---|
| `PG_URI` | Postgres connection URI |
| `API_JWKS_URI` | Supabase JWKS endpoint used for bearer-token validation |
| `API_PORT` | Listener port; defaults to `8090` |
| `SPOONACULAR_API_KEY` | Server-only recipe API key |
| `SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL for admin operations |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only account deletion credential |
| `SENTRY_DSN` | Optional API error reporting |

Local values are supplied by `infra/local-dev/docker/.env`; production values live in
Railway. See [`../../docs/SECRETS.md`](../../docs/SECRETS.md).

## Local usage

The normal path starts the API with the full local stack:

```sh
cd infra/local-dev
docker compose -f docker/docker-compose.yaml up -d
curl http://localhost:8090/health
```

For API-only development, provide the environment above and run:

```sh
npm run dev -w services/api
```

Manual authenticated upload smoke test:

```sh
curl -X POST http://localhost:8090/sync/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"crud":[]}'
```

## Validation

```sh
npm run typecheck -w services/api
npm test -w services/api
```

Tests cover authentication boundaries, upload operations, household routes, recipes, push
fan-out, rate limiting, invite codes, and native NestJS controllers.

### Quantity conflict caveat

The API currently applies writes to the single-row, `updated_at`-based pantry model. It does
not implement the required per-device quantity contribution/max-merge design. That change
requires the migration/backfill and compatibility work proposed in ADR-011.
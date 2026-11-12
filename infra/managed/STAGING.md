# Staging environment runbook (audit Task 5)

**Status:** provisioned 2026-11-12 on the always-on Linux desktop. Cloud staging
(a second PowerSync Cloud instance + Railway service) was not built: PowerSync
needs Supabase's direct endpoint, which needs the paid IPv4 add-on.

## What staging is

| Piece | Where | Address |
|---|---|---|
| Auth | Supabase project `touduidwsmeohfthtlpf` (sign-in only, no app tables) | `https://touduidwsmeohfthtlpf.supabase.co` |
| Postgres, PowerSync, API | the `infra/local-dev` Docker stack on the desktop | internal |
| PowerSync, reachable from devices | `tailscale serve` → `127.0.0.1:18080` | `https://customjc.tail65685e.ts.net:28443` |
| API, reachable from devices | `tailscale serve` → `127.0.0.1:28090` | `https://customjc.tail65685e.ts.net:28444` |

The `development` and `preview` profiles in `apps/mobile/eas.json` point at these;
only `production` points at the production stack. `apps/mobile/.env.local`
(gitignored) should hold the same four values so `expo start` uses staging too.

**The device must be on the tailnet.** A development or preview build opened on a
phone without Tailscale connected cannot reach sync or the API. Do not hand a
preview build to a tester who is not on the tailnet.

## Running it

```sh
cd infra/local-dev
docker compose -f docker/docker-compose.yaml up -d --build   # --build picks up API changes
docker compose -f docker/docker-compose.yaml ps
curl https://customjc.tail65685e.ts.net:28443/probes/liveness
curl https://customjc.tail65685e.ts.net:28444/health
```

`docker/.env` (gitignored) carries the staging settings: `PS_PORT=127.0.0.1:18080`,
`API_PORT=28090`, a generated database password, and `PS_SUPABASE_JWKS_URI` for
the staging Supabase project. The containers restart with Docker. The API image
is built from whatever is checked out, so rebuild after switching branches.

To rebuild the HTTPS front on a new machine:

```sh
tailscale serve --bg --https=28443 http://127.0.0.1:18080
tailscale serve --bg --https=28444 http://127.0.0.1:28090
```

The schema comes from the init scripts on a fresh volume; apply later migrations
with `infra/managed/migrate.sh` against the `pg-db` port. `down -v` wipes staging.

## Known gaps

- Account deletion returns 503 on staging: the compose file does not pass
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` to the API.
- Recipe search returns 503 until `SPOONACULAR_API_KEY` is set in `docker/.env`.
- Analytics and crash reports from staging builds still go to the production
  PostHog and Sentry projects.

## Acceptance check

1. Build/run a `development` client with the phone on the tailnet.
2. Sign up a staging user and add a pantry item.
3. Confirm the row is in staging Postgres:
   ```sh
   docker compose -f docker/docker-compose.yaml exec pg-db \
     psql -U postgres -d postgres -c "SELECT name, household_id FROM pantry_items WHERE deleted = false ORDER BY added_at DESC LIMIT 5;"
   ```
4. Confirm it is absent from production Postgres.

## Moving to cloud staging later

Create a PowerSync Cloud instance and a Railway `staging` environment, enable
the IPv4 add-on on the staging Supabase project, run `infra/managed/migrate.sh`
against its direct endpoint, create the publication and `powersync_role` as in
`infra/managed/README.md` §1, then swap the two addresses in `eas.json`.

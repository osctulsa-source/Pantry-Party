# Phase 2 plan — PowerSync + API on Azure Container Apps

Phase 1 (this PR) stood up the private data tier and loaded the schema. Phase 2
puts the **PowerSync sync service** and the **API** (write-path proxy + recipe /
invite endpoints) onto the *same* Container Apps environment, reachable by mobile
clients, reading from the private Postgres foundation.

This is a plan, not yet executed — it needs external secrets (below) and one
topology change.

> **▶ Resuming after a break?** Phase 1 is fully deployed & verified (see PR #142).
> To continue: (1) make sure the Postgres server is running — if it was stopped to
> save credit, `az postgres flexible-server start -g rg-pantryparty-prod-westus3 -n
> pantryparty-prod-pg`; if the whole RG was deleted, re-run `DEPLOY.md` +
> `MIGRATIONS-DEPLOY.md` first (~15 min, proven). (2) Add the 5 secrets below to
> Key Vault `pantrypartyprodkv`. (3) Work the Steps section. Nothing in Phase 1
> needs redoing.

## What Phase 1 already gives us

- Private Postgres (`pantryparty-prod-pg`, westus3), `wal_level=logical`,
  publication `powersync` over the 7 tables, `powersync_repl` role.
- Key Vault `pantrypartyprodkv` with `ps-data-source-uri`, `ps-storage-source-uri`
  (the two URIs PowerSync consumes), `pg-admin-uri`, passwords.
- ACR `pantrypartyprodacr`, user-assigned identity (AcrPull + KV Secrets User),
  Container Apps env `pantryparty-prod-aca-env` (VNet-joined).

## Decisions (proposed)

1. **Ingress topology — recreate the env as external + VNet-integrated.**
   The env is currently `internal: true` (right for the migration Job, wrong for
   phone-facing services — an internal env is only reachable inside the VNet).
   `internal` is **immutable**, so we delete + recreate the env with
   `internal: false`. It stays VNet-integrated, so apps still reach the private
   DB via the same CNAME→private-zone path we fixed in Phase 1, while getting a
   public ingress IP + per-app `*.azurecontainerapps.io` FQDNs.
   - *Rejected alternative:* keep internal + front with Application Gateway /
     Front Door — more infra and cost than v1 needs.
   - Safe now: nothing is serving yet, so the recreate has no downtime. The
     migration Job is deleted with the env and simply redeployed (idempotent; the
     DB is already migrated, so it's only needed for future migrations).

2. **PowerSync config delivery — bake the YAML into a thin image.**
   Container Apps has no host bind mounts, so we layer `service.yaml` +
   `sync-config.yaml` onto `journeyapps/powersync-service:latest`
   (`COPY` to `/config`). The YAML already uses `!env PS_DATA_SOURCE_URI` etc.,
   which PowerSync resolves from env at runtime — so secrets stay in Key Vault,
   never in the image.

3. **Secrets live in Key Vault**, read by the apps through the existing UAMI
   (same pattern as the migration Job).

4. **v1 uses the default ACA FQDNs** (`https://<app>.<hash>.westus3.azurecontainerapps.io`).
   Custom domains/cert come later.

## Secrets you must provide (they go into Key Vault)

| Secret | Where it comes from |
|---|---|
| `PS_SUPABASE_JWKS_URI` | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` (your Supabase project ref) |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → API → service_role key (secret) |
| `SPOONACULAR_API_KEY` | Spoonacular account (server-side recipe search) |
| `SENTRY_DSN_API` *(optional)* | Sentry project DSN; empty disables reporting |

`PS_DATA_SOURCE_URI` / `PS_STORAGE_SOURCE_URI` / `PG_URI` are already derivable
from Phase 1 secrets — no action needed.

## New IaC artifacts

- `infra/azure/powersync/Dockerfile` — `FROM journeyapps/powersync-service:latest`,
  `COPY` the two YAMLs to `/config`, `command: start -r unified`.
- `infra/azure/platform.bicep` — flip `vnetConfiguration.internal` to `false`
  (env recreate).
- `infra/azure/app-powersync.bicep` — Container App: external ingress → port
  8080, env (`PS_DATA_SOURCE_URI`, `PS_STORAGE_SOURCE_URI`, `PS_SUPABASE_JWKS_URI`)
  from KV via UAMI, `min replicas 1`, liveness `/probes/liveness`.
- `infra/azure/app-api.bicep` — Container App from the `services/api` image:
  external ingress → 8090, env (`PG_URI`, `API_JWKS_URI`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SPOONACULAR_API_KEY`, `SENTRY_DSN`) from KV,
  health `/health`.
- Key Vault: add the 5 secrets above (script or bicep params).

## Steps

1. Add the Supabase + Spoonacular secrets to Key Vault.
2. Recreate the ACA env as external (`internal: false`); redeploy the migration
   Job onto it.
3. Build + push the PowerSync config image (local `docker build`/`push` — ACR
   Tasks is blocked on this subscription, see MIGRATIONS-DEPLOY.md).
4. Build + push the API image from `services/api`.
5. Deploy `app-powersync.bicep`; verify `/probes/liveness`.
6. Deploy `app-api.bicep`; verify `/health`.
7. Point the mobile app's `EXPO_PUBLIC_*` URLs at the new public FQDNs (mobile
   change, separate PR).
8. End-to-end: sign in on device → streams sync → local CRUD drains via the API.

## Risks / watch-items

- **API is explicitly a TEMPORARY proxy** (ADR-008, "promoted to NestJS"). Fine
  to deploy for v1, but it's not the final backend.
- **Cost:** two always-on Container Apps (`min 1`) + the env will draw on the
  credit continuously — unlike the Job, which only ran once. Worth a budget look.
- The external env must still resolve the private DB FQDN; it will, via the
  VNet-linked private DNS zone (same mechanism Phase 1 uses).
- Supabase `audience: authenticated` and the JWKS URI must match the project the
  mobile app signs into, or sync silently rejects tokens.

## Verification

- PowerSync liveness + readiness probes green; replication slot active on the DB.
- API `/health` returns 200.
- A device signs in, sees its household data sync, and offline writes drain back.

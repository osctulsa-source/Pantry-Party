# Staging environment runbook (audit Task 5)

**Status:** NOT YET PROVISIONED — this is the executable plan. Standing up
staging requires creating cloud resources under the project's own
Supabase / PowerSync / Railway accounts (billing + credentials), which is an
owner action. Once the three resources exist, the eas.json wiring below is a
5-minute change.

## Why

Today **both** the `development` and `preview` EAS profiles point at the
**production** PowerSync instance, Railway API, and Supabase project (see
`apps/mobile/eas.json`). Every dev/test write lands in the production database,
and a destructive bug in a dev build reaches real data. Staging fixes that:
`development`/`preview` → staging, only `production` → prod.

## 1 · Provision the parallel stack (owner action)

Mirror the production stack (`infra/managed/README.md`), one tier down:

| Piece | Create | Notes |
|---|---|---|
| Supabase project | a new project, e.g. `pantry-party-staging` | Enable the **IPv4 add-on** (PowerSync direct-endpoint replication needs it, same as prod). Separate anon key + service-role key + JWKS URL. |
| PowerSync Cloud instance | a new instance | Connect to the staging Supabase **direct** endpoint as a `powersync_role` created in staging; deploy the **same** `infra/local-dev/sync-config.yaml` (it's the source of truth). |
| Railway service | a new service (or a `staging` environment on the `pantry-party` project) | Its own env vars pointing at staging Supabase (session pooler `PG_URI`, staging `API_JWKS_URI`, staging `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`). `NODE_ENV=production` is fine — "staging" is about *which data*, not the code mode. Keep **replicas = 1** (see the single-instance invariant in the main README). |

## 2 · Apply the schema to staging

Use the one canonical runner against the staging **direct** endpoint:

```sh
DATABASE_URL="postgres://postgres:<staging-pw>@db.<staging-ref>.supabase.co:5432/postgres" \
  ./infra/managed/migrate.sh
```

Then create the `powersync` publication + `powersync_role` exactly as in
`infra/managed/README.md` §1, and deploy the sync rules (§2) to the staging
PowerSync instance.

## 3 · Point `development` + `preview` at staging

In `apps/mobile/eas.json`, replace the `env` URLs/keys in the **`development`**
and **`preview`** profiles with the staging values (leave **`production`**
untouched). Each profile's `env` block becomes:

```jsonc
"EXPO_PUBLIC_POWERSYNC_URL": "https://<staging-instance>.powersync.journeyapps.com",
"EXPO_PUBLIC_API_URL":        "https://<staging-railway-domain>",
"EXPO_PUBLIC_SUPABASE_URL":   "https://<staging-ref>.supabase.co",
"EXPO_PUBLIC_SUPABASE_ANON_KEY": "<staging anon key>",
// PostHog: keep prod, or use a separate staging project to keep analytics clean
```

Also update the local dev file `apps/mobile/.env.local` (gitignored) to the
staging URLs so `expo start` on a bare dev build hits staging, not prod.

> These are bundled at **build time** — rebuild the dev/preview client (or
> `expo start -c`) after changing them.

## 4 · Acceptance check (the Task 5 definition of done)

1. Build/run a `development` client.
2. Sign in with a **staging** test user and add a pantry item.
3. Confirm the row appears in **staging** Postgres:
   ```sh
   psql "$STAGING_PG_URI" -c "SELECT name, household_id FROM pantry_items WHERE deleted = false ORDER BY added_at DESC LIMIT 5;"
   ```
4. Confirm it is **absent** from production Postgres (same query against the prod
   pooler URI returns nothing new). ✅ = dev builds no longer touch prod.

## Notes

- The prod anon key currently sits in `eas.json` in git. The staging anon key is
  likewise non-secret (anon keys are public by design), so committing the
  staging values is fine — but the staging **service-role key** is a real secret
  and belongs only in the staging Railway service vars + a gitignored `.env`,
  never in `eas.json` (same rule as prod).
- Once staging exists, hand me the staging URLs + anon key and I'll wire the
  `eas.json` change and verify the acceptance check.

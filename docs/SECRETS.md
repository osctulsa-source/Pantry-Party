# Secrets management

How production secrets and config are stored, scoped, and rotated on the managed
stack (Supabase + PowerSync Cloud + Railway). Provisioning + the authoritative
env tables are in [`infra/managed/README.md`](../infra/managed/README.md); this
doc is the security view: what's secret, where it lives, and how to rotate it.

> This file names secrets and their locations only — **never their values.** Real
> values live in the SaaS dashboards and in developers' gitignored `.env` files.

---

## 1. Principles

- **No secrets in git.** Only `.env.example` templates (no values) are committed.
  Real dev values go in gitignored `.env` files; real prod values live in the
  provider dashboards.
- **Least privilege + server-only for true secrets.** Anything that can bypass
  tenancy (service-role key, DB credentials) exists **only** server-side on
  Railway, never in the mobile bundle.
- **Rotate on exposure or offboarding.** Any leak (or a departing person who had
  access) triggers rotation of the affected secret (§4).
- There is currently **no central secret manager** — the Azure Key Vault copy
  died with the Azure teardown (ADR-007). The SaaS dashboards + gitignored
  `.env` files are the store. `[If the team grows, consider Doppler / 1Password /
  Railway shared variables as a single source; not required at current scale.]`

## 2. The public/secret boundary (read this first)

The most important rule: **everything prefixed `EXPO_PUBLIC_` is compiled into
the mobile app bundle and is therefore PUBLIC.** It can be extracted from any
installed build. Never put a true secret behind an `EXPO_PUBLIC_` name.

- **Public by design (safe in the client):** `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_POWERSYNC_URL`,
  `EXPO_PUBLIC_API_URL`. The Supabase **anon key** is a publishable key; security
  does not depend on it being secret (tenancy is enforced by the sync rules and
  the API upload-proxy, per ADR / `infra/managed/README.md`).
- **True secrets (server-side only, never in the client):** the Supabase
  **service-role key**, the Postgres connection string (`PG_URI`), the
  `powersync_role` password, and the Spoonacular API key. The Spoonacular key was
  deliberately moved off the client into the API proxy for exactly this reason.

## 3. Inventory

| Secret / config | What it is | Sensitivity | Where it lives (prod) | Dev location |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key; **bypasses RLS**; used by the account-deletion endpoint | **Critical** | Railway `api` variables | gitignored `.env` |
| `PG_URI` | Supabase session-pooler Postgres URI (contains the DB password, URL-encoded) | **Critical** | Railway `api` variables | gitignored `.env` |
| `powersync_role` password (`PS_ROLE_PASSWORD`) | Replication role Postgres password used by PowerSync + at deploy | **Critical** | PowerSync instance config (`service.yaml`) | used at deploy only |
| `SPOONACULAR_API_KEY` | Recipe search key (shared quota) | High | Railway `api` variables | gitignored `.env` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable anon key | Public by design | mobile build (`eas.json` env / `.env.local`) | `.env.local` |
| `EXPO_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | Supabase project URL | Public / config | Railway (API reads both) + mobile build | `.env` / `.env.local` |
| `EXPO_PUBLIC_POWERSYNC_URL` | PowerSync Cloud instance URL | Public / config | mobile build | `.env.local` |
| `EXPO_PUBLIC_API_URL` | Railway API base URL | Public / config | mobile build | `.env.local` |
| `API_JWKS_URI` | Supabase JWKS endpoint (public URL) | Config (not secret) | Railway `api` variables | `.env` |
| `SENTRY_DSN` | Error-reporting DSN; unset = disabled | Low (treat as config) | Railway `api` (+ mobile if wired) | `.env` |
| Release-signing credentials | App Store Connect API key; Android keystore / Play service account | **Critical** | EAS/Expo credential store + the app stores | EAS-managed |

`[Keep this table in sync with the Railway env table and the mobile
EXPO_PUBLIC_* set in infra/managed/README.md — if a var is added there, add it
here with its sensitivity.]`

## 4. Rotation

Rotate on suspected exposure, on a leak of any `.env`, or when someone with
access leaves. General procedure: mint the new value in the provider dashboard →
update every consumer → verify → invalidate the old value.

- **Supabase service-role / anon keys:** Supabase → Project Settings → API →
  roll the key → update Railway (`SUPABASE_SERVICE_ROLE_KEY`) and, for the anon
  key, the mobile `EXPO_PUBLIC_SUPABASE_ANON_KEY` + rebuild. Anon-key rotation
  ships only in a new build (bundled at build time).
- **Database password / `PG_URI` / `powersync_role`:** change the role password
  in Supabase → update `PG_URI` on Railway and the `powersync_role` password in
  PowerSync `service.yaml` (`powersync deploy`) → verify the API can write and
  PowerSync is replicating.
- **`SPOONACULAR_API_KEY`:** regenerate in the Spoonacular dashboard → update
  Railway → the 24h proxy cache and limiter are unaffected.
- **Release-signing credentials:** managed via EAS; rotate through Expo + the
  app stores if compromised (higher-impact — coordinate carefully).

## 5. If a secret leaks

1. **Rotate immediately** (§4) — start with the most dangerous
   (`SUPABASE_SERVICE_ROLE_KEY`, `PG_URI`, `powersync_role`).
2. Review access logs (Supabase, Railway, PowerSync) for misuse during the
   exposure window.
3. If the DB may have been reached directly, treat it as a data-security incident
   (see the account/privacy obligations in `docs/legal/PRIVACY.md`) and follow
   `docs/BACKUP-DR.md` if a restore is warranted.
4. Record what leaked, when, and the remediation.

## 6. Handling rules

- Never paste real secret values into chat, issues, PRs, commits, or logs.
- Keep `.env.example` files complete (every var present, no values) so a fresh
  clone knows what to set; keep them in sync with §3.
- Give each person the least access they need; remove access on offboarding and
  rotate anything they held.

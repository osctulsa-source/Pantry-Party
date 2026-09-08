# Breadbox

> **Internal codename, not a product name.** Brand name, copy, colors, and typography are
> intentionally isolated from feature code. Do not hardcode the codename in the app UI.

Breadbox is an offline-first pantry and cooking app for iOS and Android. It helps a
household capture food, track quantities and expiry, maintain a shared shopping list, and
find recipes that use what is already available.

This repository is an npm-workspace monorepo containing the Expo mobile app, shared domain
logic, the NestJS API, database/sync configuration, curated recipe and shelf-life data, and
operational runbooks.

## Current architecture

| Layer | Technology | Responsibility |
|---|---|---|
| Mobile | React Native + Expo + TypeScript | Capture, pantry, recipes, shopping, household, notifications, insights, and widgets |
| Local data | PowerSync SQLite through `@powersync/op-sqlite` | Source of truth for normal feature reads and writes; remains usable offline |
| Sync | PowerSync Cloud | Downloads household-scoped Postgres changes to each device |
| Upload path | `services/api` on Railway | Authenticates and applies the PowerSync client CRUD queue |
| Backend | NestJS with legacy Express routers | Sync uploads, household invites, recipe proxying, account deletion, and push workflows |
| Database + auth | Supabase Postgres + Auth | Durable server state, JWT identity, and logical-replication source |
| Shared domain | Zod schemas and pure TypeScript in `packages/core` | Canonical pantry model and reusable product rules |
| Partners | Spoonacular and Open Food Facts | Recipe data and barcode metadata; secret partner keys stay server-side |
| Observability | Sentry + PostHog | Error reporting and product analytics |

The mobile UI is **local-first**: feature code reads and writes the local PowerSync database
instead of waiting for network requests. PowerSync downloads server changes automatically;
the mobile connector uploads queued mutations through the authenticated API. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data flow and current limitations.

## Repository map

```text
apps/mobile/        Expo mobile application and feature code
packages/core/      Canonical Zod schemas and shared domain logic
services/api/       NestJS API with legacy Express routers under migration
infra/local-dev/    Local Postgres + PowerSync + API Docker environment
infra/managed/      Supabase + PowerSync Cloud + Railway production runbook
data/               Curated recipes and generated shelf-life data
docs/               Architecture, ADRs, operations, legal, and feature designs
web/legal/          Static legal-document website
spikes/             Throwaway experiments; never import these into production code
```

`infra/azure/` is a parked deployment path retained as reference. It is not the active
production topology.

## Prerequisites

- Node.js 20 or newer
- npm
- Docker Desktop for the fully local backend/sync stack
- Xcode or Android Studio for native development builds
- Supabase credentials for authentication, even when using local PowerSync

The app uses native Expo modules, PowerSync, and op-sqlite. Use an Expo development build;
Expo Go is not sufficient. Application features must remain in TypeScript/Expo modules—do
not hand-maintain native Swift, Objective-C, Java, or Kotlin code.

## Install and verify

```sh
npm ci --legacy-peer-deps

# Match the checks used by CI
npx tsc -p apps/mobile/tsconfig.json --noEmit
npm run typecheck -w services/api
npm run lint
npm test -w packages/core
npm test -w services/api
cd apps/mobile && npm test
```

The repository root `npm test` is not the aggregate test command; tests currently run per
workspace as shown above and in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Run locally

1. Follow [`infra/local-dev/README.md`](infra/local-dev/README.md) to start Postgres,
   PowerSync, and the API.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` and provide the required
   public Supabase, PowerSync, and API configuration.
3. Start a native development build:

```sh
npm run ios -w apps/mobile
# or
npm run android -w apps/mobile
```

Use `npm run start -w apps/mobile` when the development client is already installed.

## Engineering invariants

- Import the canonical `PantryItem` schema from `@breadbox/core`; never redefine it.
- Treat the local PowerSync database as the feature-facing source of truth.
- Scope server reads and writes by the authenticated user's household membership.
- Keep partner API keys and privileged Supabase credentials out of the mobile bundle.
- Import visual tokens from `apps/mobile/src/theme/tokens.ts`; keep brand values out of
  feature code.
- Keep `spikes/` disposable and isolated from production packages.
- Make sync operations idempotent.

### Known quantity conflict debt

The required quantity design is a per-device contribution model with idempotent max-merge.
It is **not implemented yet**. The current production-shaped `pantry_items` table stores one
quantity on one UUID row and uses `updated_at` last-write-wins. Do not describe current
behavior as summing or max-merge, and do not change the live schema without a migration,
backfill, mixed-client compatibility plan, and sync torture tests. See ADR-011 in
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## Operational references

- [Architecture](docs/ARCHITECTURE.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Managed production stack](infra/managed/README.md)
- [Local development stack](infra/local-dev/README.md)
- [Secrets management](docs/SECRETS.md)
- [Backup and disaster recovery](docs/BACKUP-DR.md)
- [TestFlight runbook](docs/TESTFLIGHT.md) — last known good **build 47**; OTA is off; never `eas submit --latest`. Agents: see [AGENTS.md](AGENTS.md).
# Pantry Party

[![CI](https://github.com/osctulsa-source/Pantry-Party/actions/workflows/ci.yml/badge.svg)](https://github.com/osctulsa-source/Pantry-Party/actions/workflows/ci.yml)

**A shared pantry that keeps working offline.** Capture groceries, review receipt text,
track expiry, find recipes, and coordinate a household shopping list.

Created and maintained by **[JC Senka](https://www.linkedin.com/in/jcsenka/)**.
Built with **React Native / Expo, TypeScript, SQLite / PowerSync, NestJS, and Supabase**.

[Website](https://legal-production-9e0c.up.railway.app/) ·
[Engineering case study](docs/portfolio/CASE-STUDY.md) ·
[Demo guide](docs/portfolio/DEMO.md) ·
[Request beta access](mailto:jcsenka013@gmail.com?subject=Pantry%20Party%20beta)

<!-- portfolio-screenshots:start -->
<!-- Real app screenshots are added here by web/legal/generate.py when supplied. -->
<!-- portfolio-screenshots:end -->

## Project status

The iPhone app is a **working TestFlight beta**. As of October 8, 2026, JC has been
using it successfully for a couple of months. See the [TestFlight runbook](docs/TESTFLIGHT.md) for
device validation and release gates.
The repository also contains Android configuration; this does not establish an Android
store release. A public App Store release is not claimed here.

Engineering examples worth inspecting:

- **Offline data flow:** local SQLite reads/writes, queued API uploads, and household-scoped
  sync downloads ([architecture](docs/ARCHITECTURE.md)).
- **Capture with correction:** on-device receipt OCR, parsing, and editable item review
  ([OCR helper](apps/mobile/src/features/capture/runTextOcr.ts)).
- **Concurrency regression:** transactional household bootstrap and a four-request race
  test against Postgres ([integration tests](services/api/src/__integration__/household.integration.test.ts)).
- **Session cleanup:** a regression test for sign-out racing an in-flight sync connection
  ([test](apps/mobile/src/data/powersync/db.race.test.ts)).
- **Release validation:** checked build numbers and generated JavaScript bundle phases
  ([release helpers](scripts/lib)).

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

Internal package names use the codename **Breadbox**. Branding stays in theme tokens
rather than feature code. This npm-workspace monorepo contains the mobile app, shared
domain logic, API, infrastructure, and product data.

```text
apps/mobile/        Expo mobile application and feature code
packages/core/      Canonical Zod schemas and shared domain logic
services/api/       NestJS API with legacy Express routers under migration
infra/local-dev/    Local Postgres + PowerSync + API Docker environment
infra/managed/      Supabase + PowerSync Cloud + Railway production runbook
data/               Curated recipes and generated shelf-life data
docs/               Architecture, ADRs, operations, legal, and feature designs
web/legal/          Product website, engineering case study, and legal pages
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

The repository root `npm test` aggregates the core, API, and mobile unit suites. CI runs
them individually as shown above. `npm run test:ios-release-scripts` runs the additional
release-helper suite.

The API integration suite is separate: `npm run test:integration -w services/api` requires
a disposable Postgres database. CI provisions one and also checks migrations, the API
image lockfile, and the generated iOS bundle phase. Never point test fixtures at production.

If a clean npm install reports that `jest-expo` cannot find the already-declared
`@react-native/jest-preset`, the preset may be nested in the mobile workspace. From
`apps/mobile`, run `NODE_PATH="$PWD/node_modules" npm test -- --runInBand`; this resolves
that workspace dependency without changing the lockfile.

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

## License

Source is available to read and evaluate; all rights reserved. See [LICENSE](LICENSE).

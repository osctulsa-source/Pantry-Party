# @breadbox/mobile

The iOS and Android client: React Native + Expo, strict TypeScript, and a local-first
PowerSync SQLite data layer.

## Product areas

Feature code is co-located under `src/features`:

- `capture` — barcode, camera/OCR review, and bulk/manual capture
- `pantry` and `expiry` — local inventory, quantities, fill levels, locations, and expiry
- `recipes` — pantry matching, preferences, favorites, cooking mode, timers, and feedback
- `shopping` — shared household shopping list and shopping runs
- `household` and `announcements` — membership, invites, activity, and push workflows
- `onboarding`, `auth`, `account`, and `settings` — lifecycle and preferences
- `insights`, `tips`, `activity`, and `widget` — retention and glanceable surfaces

Navigation is under `src/navigation`; shared components, motion, feedback, observability,
and theme tokens have their own top-level `src` directories.

## Data flow

The UI reads and writes the local PowerSync database. The client schema is
`src/data/powersync/schema.ts`; setup, Supabase JWT handoff, upload, and teardown are in
`src/data/powersync/db.ts`.

- PowerSync downloads household-scoped Postgres changes to SQLite automatically.
- Local writes queue offline and upload to `services/api` through `POST /sync/upload`.
- Supabase Auth provides the user session used by both PowerSync and the API.
- Sign-out disconnects PowerSync and clears local data before another user can sign in.

Import the canonical `PantryItem` schema and domain helpers from `@breadbox/core`. Do not
create feature-local pantry item shapes.

## Native workflow

This app uses Expo's managed/prebuild workflow with development builds. PowerSync/op-sqlite,
camera/OCR, notifications, audio, widgets, and other modules mean Expo Go is not a supported
runtime.

Use Expo config/plugins and Expo modules. Do not implement or maintain product features in
raw Swift, Objective-C, Java, or Kotlin.

## Configuration

Copy `.env.example` to `.env.local` and fill the required values:

- `EXPO_PUBLIC_POWERSYNC_URL`
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- optional Sentry and PostHog values

Every `EXPO_PUBLIC_*` value is bundled into client JavaScript and is public by design. Never
place database credentials, a Supabase service-role key, replication credentials, or a
partner API secret in these variables.

For EAS builds, profile environment values live in `eas.json`; `.env.local` is for local
development and is not the production build source.

## Commands

From the repository root:

```sh
npm run start -w apps/mobile
npm run ios -w apps/mobile
npm run android -w apps/mobile

npx tsc -p apps/mobile/tsconfig.json --noEmit
cd apps/mobile && npm test
```

Use `start` when a compatible development client is already installed. `ios` and `android`
build/install the native development app.

## Shipping TestFlight

Do not invent a path. Follow [`docs/TESTFLIGHT.md`](../../docs/TESTFLIGHT.md).

- Last known good: **build 47**. Skip 41–46.
- OTA is off (`updates.enabled: false`). Full Mac-local production build only.
- `npm run ios:preflight` → `eas build --local` → `npm run ios:submit -- <ipa>`.
- The submit script inspects the IPA (JS present, updates off, widget version match) and refuses `--latest`.

## Conventions

- Import colors, type, spacing, and motion values from `src/theme/tokens.ts`.
- Never hardcode the codename or future product name in feature code.
- Use functional components with typed props and keep components atomic.
- Validate untrusted capture/API data with the shared Zod schemas.
- Put analytics behind `src/observability/analytics.ts`, not direct feature-level PostHog
  calls.
- Design writes for offline replay and idempotence.

### Quantity conflict caveat

The current synced `pantry_items` row uses one UUID and `updated_at` last-write-wins. The
required per-device contribution/max-merge model is tracked as ADR-011 but is not yet
implemented. Do not add naive summing or claim current writes are max-merged.

See [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for the complete system and
[`../../infra/local-dev/README.md`](../../infra/local-dev/README.md) for local services.
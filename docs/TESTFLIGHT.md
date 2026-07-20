# iOS TestFlight — build, submit & distribute

How to get an iOS build into TestFlight. The first successful internal TestFlight
build landed on device on **2026-07-06** (App Store Connect app
**PantryPartyColeTech**). Provisioning of the backend it talks to is in
[`infra/managed/README.md`](../infra/managed/README.md).

> **Live-backend note:** the app's `EXPO_PUBLIC_*` endpoints (Supabase, PowerSync
> Cloud, Railway) are baked in **at build time** from the per-profile `env` in
> `eas.json`. A TestFlight build therefore talks to the **live** managed stack —
> make sure the production profile points at prod, not localhost.

## Which path do I need? (decide first)

| You changed… | Ship it via |
|---|---|
| **JS/TS only** (screens, hooks, logic, styles, images imported from JS) | **EAS Update (OTA)** — ~1 minute, no build. See [OTA updates](#ota-updates-eas-update--js-only-changes-in-1-minute). |
| `app.config.js`, plugins, native deps (`package.json` deps with native code), `targets/widget/`, splash/icons | **Full build** — the recipe below, then submit. |
| Not sure | Full build — always safe, just slower. |

## Prerequisites (one-time)

- Apple Developer Program membership + access to the App Store Connect record
  (**PantryPartyColeTech**).
- `eas-cli` installed and `eas login`.
- The production `ios.bundleIdentifier` in `app.config.js` matches the bundle id
  on the App Store Connect record. ⚠️ **The bundle id is effectively permanent
  once a build is uploaded.**
- EAS-managed signing (EAS creates/holds the distribution cert + provisioning
  profile on the first build).

## Build recipe (the important part)

The first EAS build failed on a hardcoded-CocoaPods-path bug caused by reusing
stale native `ios/` artifacts. **Whenever `app.config.js`, `eas.json` env vars,
or the widget/targets change, regenerate native iOS first.** From `apps/mobile/`:

```sh
# 1. Regenerate the native iOS project from config
npx expo prebuild --platform ios --clean

# 2. Delete stale native artifacts so EAS regenerates Pods fresh
rm -rf ios/Pods ios/Podfile.lock ios/*.xcworkspace ios/build

# 3. Build on EAS (production profile)
eas build --platform ios --profile production
```

Deleting `ios/Pods`, `ios/Podfile.lock`, `ios/*.xcworkspace`, and `ios/build`
forces EAS's remote workers to regenerate CocoaPods with the correct **remote**
paths — this is what avoids the hardcoded-path failure.

> ⚠️ **On Windows, step 1 is destructive.** `expo prebuild --platform ios
> --clean` deletes `ios/` and then CANNOT regenerate it ("Run npx expo prebuild
> again from macOS or Linux"). The local `ios/` directory is **load-bearing**:
> `.easignore` deliberately un-ignores it so the upload carries the native
> project and EAS skips its buggy remote widget prebuild — without it, every
> remote build fails in "Configure Xcode project" AND the fingerprint changes
> (so OTA updates stop matching installed builds). If `ios/` is missing or
> stale on a Windows machine, regenerate it in a Linux container instead
> (from the repo root; env mirrors the production build profile):
>
> ```sh
> MSYS_NO_PATHCONV=1 docker run --rm -v "C:/Users/JCS/Pantry-Party:/work" \
>   -w /work/apps/mobile -e APP_VARIANT=production -e APPLE_TEAM_ID=X7E3964XPW \
>   -e SENTRY_DISABLE_AUTO_UPLOAD=true -e CI=1 \
>   node:20 npx expo prebuild --platform ios --no-install
> ```
>
> Verify afterwards: `PRODUCT_BUNDLE_IDENTIFIER = com.osctulsa.pantryparty`
> (no `.dev`) and the `.widget` target in
> `ios/PantryParty.xcodeproj/project.pbxproj`.

**Build numbers:** the production profile's `autoIncrement` in `eas.json` bumps
the build number automatically — no manual edit needed.

## Building from Windows — containerized recipe (validated: build 20)

`expo prebuild` cannot generate the iOS project on Windows, and submitting from
Windows fails the **fingerprint runtime-version check** (the local hash never
matches what EAS's Linux/macOS workers compute — build 19 died this way). Run
the whole flow inside a Linux container instead; the fingerprint is computed on
exactly the tree that gets uploaded, and it matches the workers:

```sh
docker run --rm -e EXPO_TOKEN=<token> -v "<repo-root>:/src:ro" node:20 bash -lc "
  git clone -q --depth 1 file:///src /work && cd /work &&
  npm ci --no-audit --no-fund --ignore-scripts &&
  cd apps/mobile &&
  APP_VARIANT=production npx expo prebuild --platform ios --no-install &&
  npx eas-cli build --platform ios --profile production --non-interactive --no-wait"
```

Notes:
- The clone uses **committed state** — commit (or merge to main) before building.
- `APP_VARIANT=production` at prebuild is REQUIRED (bakes the store bundle id).
- `eas submit` from Windows can also fail silently — run it via the same
  container, mounting the ASC `.p8` key and setting `EXPO_ASC_API_KEY_PATH`,
  `EXPO_ASC_KEY_ID`, and `EXPO_ASC_ISSUER_ID`.

## Submit to App Store Connect

```sh
eas submit --platform ios --profile production
```

The build processes for a few minutes, then appears under the **TestFlight** tab.

> The **Distribution** tab (screenshots, description, "Add for Review") is for the
> **public App Store release** and is **not** required for TestFlight. Ignore it
> until you're doing a public launch.

## OTA updates (EAS Update) — JS-only changes in ~1 minute

`expo-updates` is wired with `runtimeVersion: { policy: 'fingerprint' }` and the
production build profile is on the **`production` channel** (`eas.json`). That
means installed TestFlight builds check for published JS updates and apply them —
no new build, no upload, no processing wait.

> **Pre-publish gate:** run the Maestro smoke flows first (`npm run smoke`
> against a booted sim — see [`.maestro/README.md`](../.maestro/README.md)).
> They pin the bug classes that previously shipped to TestFlight unnoticed
> (dead buttons, unreachable content, clipped labels).

**Ship a JS-only change** (from `apps/mobile/`, on the same `main` state the
current TestFlight build was made from):

```sh
APP_VARIANT=production eas update --channel production --environment production \
  --message "fix: whatever changed"
```

⚠️ **`APP_VARIANT=production` is mandatory.** `eas.json`'s `env` block only
applies to *builds* — `eas update` doesn't read it, so without the shell
variable `app.config.js` resolves the **development** variant (`.dev` bundle
ids), the fingerprint comes out different, and the update is silently fenced
off from every installed build (it looks published but no phone ever gets it).
Verify delivery: the `Runtime version` printed must **equal the fingerprint of
the installed build** (`eas fingerprint:compare <build-fingerprint>` diagnoses
a mismatch). A dirty working tree changes the fingerprint the same way — commit
or stash first (the publish output marks a dirty tree with `*` after the
commit hash).

- **When testers get it:** the app downloads the update in the background on
  launch and applies it on the **next** launch. To see it deterministically:
  kill the app, open it (downloads), kill it again, open it (runs the update).
- **Safety (why fingerprint):** the update carries a hash of the native runtime
  it was built against. Builds whose native side doesn't match simply don't
  receive it — so an OTA update can never crash an older binary by referencing
  a native module it doesn't have. If you've changed anything native since the
  last build, `eas update` will target a fingerprint no installed build has:
  that's your signal to ship a **full build** instead.
- **What can ship OTA:** JS/TS, styles, JS-imported assets. **What cannot:**
  anything in the full-build row of the table above.
- **Prefer `scripts/publish-ota.sh "msg"`** over the raw command — it enforces
  the clean-tree + APP_VARIANT guardrails above and uploads Sentry sourcemaps
  when credentials are set.
- **expo-audio (added 2026-07-17, cook-feedback branch):** adding it changed the
  fingerprint (`3b1e5369…` → `b64a20d5…`), so once it's on main, OTA publishes
  will NOT reach builds made before it — cut a new TestFlight build after
  merging. Until users are on that build, the feedback layer is intentionally
  haptics-only: `src/feedback/feedback.ts` lazy-requires expo-audio in a
  try/catch, so older binaries degrade silently instead of crashing. The cook
  Live Activity does NOT need the new build — its layout ships in the JS bundle
  and renders via the widget extension already present in current builds.

### Sentry in production — current state & how to turn it on

The app initializes Sentry from `EXPO_PUBLIC_SENTRY_DSN`
(`src/observability/sentry.ts`) — and **nothing supplies that variable in
production**: it's absent from `eas.json`'s production env, the EAS-hosted
production environment is empty, and the root `.env`'s `SENTRY_DSN` lacks the
`EXPO_PUBLIC_` prefix so it never reaches the app. Production builds log
"error reporting disabled" and every TestFlight crash goes unreported.

To enable (in order of preference):

1. **EAS-hosted env var** (works for OTA bundles immediately, no fingerprint
   change): `eas env:create --environment production --name
   EXPO_PUBLIC_SENTRY_DSN --value <dsn> --visibility plain --scope project`,
   then publish an OTA with `--environment production`. A DSN is not a secret
   (it ships inside every client bundle by design).
2. For **full builds**, the same EAS env var is injected at build time too —
   no `eas.json` edit needed (editing `eas.json` would move the fingerprint).

Sourcemap upload for OTA bundles additionally needs `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG`, and `SENTRY_PROJECT` in the publishing shell —
`scripts/publish-ota.sh` picks them up automatically and warns when missing.
(`SENTRY_DISABLE_AUTO_UPLOAD=true` in `eas.json` only affects build-time
uploads, and stays until Sentry credentials exist on EAS workers.)

**One-time activation:** OTA only works in builds that CONTAIN the expo-updates
runtime — i.e. builds made after this config landed. The first build after
adding `expo-updates` must be a full build (recipe above).

## Gotchas resolved on the first build (all fixed / committed)

Recognize these if they recur:

- **Missing GitHub remote** — EAS needs the repo's git remote configured.
- **`@bacons/apple-targets` widget-target bug** — only reproduces on EAS
  **remote** workers (not local); worked around via a committed **`.easignore`**
  that excludes the offending target files from the EAS upload.
- **Hardcoded CocoaPods path** — solved by the prebuild-clean + delete-Pods
  recipe above.
- **Missing `babel-preset-expo`** — added so the remote build transforms
  correctly.
- **Sentry sourcemap-upload snag** — resolved in config (see the Sentry setup
  notes / `SENTRY_DISABLE_AUTO_UPLOAD` if it recurs).

## Distribute to testers

- **Internal testing** (your team, up to 100): add the tester's Apple ID email to
  the internal testing group in App Store Connect. They install via the TestFlight
  app. **No re-submission** needed unless you ship a new build — and **no** beta
  review, screenshots, or App Privacy answers required.
- **External testing** (up to ~10,000): additionally requires a **beta App
  Review**, **Test Information** (beta description + contact), the **App Privacy**
  questionnaire, and a **hosted privacy-policy URL** — draft in
  [`docs/legal/PRIVACY.md`](./legal/PRIVACY.md); host it and enter the URL.

## Shipping a new build

Re-run the build recipe → `eas submit`. `autoIncrement` handles the build number;
the new build appears in TestFlight and existing internal testers get it
automatically. For JS-only changes, prefer an [OTA update](#ota-updates-eas-update--js-only-changes-in-1-minute)
instead.

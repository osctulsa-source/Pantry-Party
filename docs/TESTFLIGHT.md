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

⚠️ **A full build for a native change also needs a `runtimeVersion` bump** in
`app.config.js`. The runtime is an explicit string, not a fingerprint, so it will
not notice on its own — and an OTA published onto a stale runtime can crash
installs that lack the native code. See [OTA updates](#ota-updates-eas-update--js-only-changes-in-1-minute).

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

**EAS prebuilds the native iOS project server-side, from committed config, on
every build.** There is no local `ios/` step and no Docker container — those were
removed after they produced two different binaries from the same commit (see
[Why the recipe changed](#why-the-recipe-changed-2026-09-04)). From the repo root:

```sh
# 1. Bump the build number (writes ios.buildNumber in app.config.js)
npm run ios:next-build-number

# 2. Commit and push — a build must correspond to a reviewable commit
git add apps/mobile/app.config.js && git commit -m "chore(ios): build N" && git push

# 3. Gate: verifies provenance, config invariants and the build number
npm run ios:preflight

# 4. Build
cd apps/mobile && eas build --platform ios --profile production
```

**Do not skip step 3.** `npm run ios:preflight` is the whole postmortem list
turned into checks, and it costs a few seconds against a build that costs 20
minutes and a wasted build number:

| It checks | Because |
|---|---|
| Working tree is clean | A build must map to a commit. |
| `HEAD` exists on a remote | Builds 42/43 came from commit `f8ebd5c`, which is in neither this repo nor GitHub — the binaries in TestFlight have no reviewable source. |
| `ios.buildNumber` > every build EAS has issued | App Store Connect rejects a duplicate `(version, build)` pair *after* the build has run. |
| `runtimeVersion` is an explicit string | A fingerprint policy gives every build its own runtime, so no OTA can reach it. |
| `withWidgetVersionSync` runs after `expo-widgets` | Otherwise the widget extension ships `CFBundleVersion 1` against the host app — fatal. |
| Widget bundle id derives from the app bundle id | An extension must live under its host app's id. |
| Production bundle id has no `.dev` suffix | `APP_VARIANT` not applying silently produces an unuploadable binary. |
| `appVersionSource: local`, `autoIncrement: false` | The version scheme this repo can actually support (see below). |
| `.easignore` does not un-ignore `ios/` | Uploading a native project makes EAS skip prebuild and ignore your config. |

The same invariants — everything above that does not need network or git — also
run in CI as `apps/mobile/releaseInvariants.test.js`, so a PR that breaks one
fails review rather than the release. The rules live in one place,
[`scripts/lib/release-invariants.cjs`](../scripts/lib/release-invariants.cjs),
shared by the gate and the test so they cannot drift.

### Build numbers

EAS `autoIncrement` is **not usable in this repo**. With
`cli.appVersionSource: "local"` it has to write the resolved version back into
the config, and it cannot write a JS config:

```
autoIncrement option is not supported when using app.config.js
```

Turning it on fails the build (#237). Turning it off without any other check
risks re-using a build number and getting rejected on upload (#238). This repo
flipped that flag back and forth in two consecutive commits.

The resolution is **not** to flip it again: `ios.buildNumber` in `app.config.js`
is the single source of truth, and `npm run ios:next-build-number` performs the
increment EAS cannot, reading the highest number EAS has already issued and
writing the next one. `npm run ios:preflight` then refuses to build if the
number is not strictly greater.

> Switching to `appVersionSource: "remote"` is not a shortcut here — it splits
> the build number across two sources, and `withWidgetVersionSync` (which stamps
> the widget extension) reads it from the config. The preflight fails if the
> scheme changes.

### Why the recipe changed (2026-09-04)

The old recipe ran `expo prebuild` locally (or in a Linux container, since
prebuild cannot run on Windows) and shipped the resulting `apps/mobile/ios/` to
EAS via an `!apps/mobile/ios/` un-ignore in `.easignore`. That existed to dodge a
bug in EAS's remote widget prebuild.

It broke in a way that was very hard to see. `ios/` is **gitignored**, so what
got uploaded was one machine's *untracked* snapshot — and EAS skips prebuild
whenever a native project is present, so that snapshot silently overrode
`app.config.js`. By 2026-09-04 it sat at `CFBundleVersion 40` while the config
said `43`. Meanwhile the container recipe cloned *committed* state, where `ios/`
does not exist, and prebuilt fresh. Two build paths, two different binaries from
the same commit, and no way to tell from the outside which one you got.

Builds 42 and 43 confirmed EAS's server-side prebuild now works, so the
un-ignore is gone and `ios/` is never uploaded. The widget-target bug that
motivated it is handled in config instead, by
[`apps/mobile/plugins/withWidgetVersionSync.js`](../apps/mobile/plugins/withWidgetVersionSync.js).

If you ever do need a local native project for Xcode debugging, generate it on a
Mac or in a Linux container — but it is a local artifact only, it is gitignored,
and nothing uploads it:

```sh
cd apps/mobile && APP_VARIANT=production npx expo prebuild --platform ios --no-install
```

## Submit to App Store Connect

```sh
eas submit --platform ios --profile production
```

The build processes for a few minutes, then appears under the **TestFlight** tab.

> The **Distribution** tab (screenshots, description, "Add for Review") is for the
> **public App Store release** and is **not** required for TestFlight. Ignore it
> until you're doing a public launch.

## OTA updates (EAS Update) — JS-only changes in ~1 minute

`expo-updates` is wired to an **explicit `runtimeVersion` string** (`'1.0.0'` in
`app.config.js`), and the production build profile is on the **`production`
channel**. Installed TestFlight builds check for published JS updates and apply
them — no new build, no upload, no processing wait.

**Always publish with the script.** It is the only path that runs the
reachability gate:

```sh
npm run ota:publish "fix: whatever changed"
```

### The failure mode this protects against

An update targets the runtimeVersion `app.config.js` resolves to. An installed
build only accepts updates matching the runtimeVersion baked into it at build
time. When those diverge, the publish still reports success — it just reaches
**zero devices**, and you find out days later when nothing changed on anyone's
phone.

This is live right now: TestFlight builds 42 and 43 carry *fingerprint*
runtimeVersions (`de3e88e3…`, `f16fc241…`) because they were built from a tree
that still used `policy: 'fingerprint'`. Every update published from `main`
targets `1.0.0` and is invisible to them.
[`scripts/check-ota-reachability.mjs`](../scripts/check-ota-reachability.mjs)
compares the two and refuses to publish on a mismatch; `npm run ota:publish`
calls it before every publish. **A mismatch means you need a full build, not an
update.**

Three things silently change the runtimeVersion you publish on, and the script
blocks all three:

- **Missing `APP_VARIANT=production`** — `eas.json`'s `env` block applies only to
  *builds*; `eas update` does not read it. Without the shell variable
  `app.config.js` resolves the **development** variant (`.dev` bundle ids) and
  the update is fenced off from every production install.
- **A dirty working tree** — what you publish must correspond to a reviewable
  commit, or nobody can tell later what testers are actually running.
- **A native change since the last build** — see the bullet below.

### Notes

- **When testers get it:** the app downloads the update in the background on
  launch and applies it on the **next** launch. To see it deterministically:
  kill the app, open it (downloads), kill it again, open it (runs the update).
- **⚠️ The explicit runtimeVersion is manual discipline.** With a fingerprint
  policy, a native change automatically produced a runtime no installed build
  had — unreachable, but *safe*. An explicit string does not do that: publish
  JS that calls a native module the installed binary lacks and those installs
  **crash**. So: **bump `runtimeVersion` and cut a full build whenever the native
  runtime changes** (add/remove/upgrade a native module, change an Expo plugin or
  build property). JS-only changes need no bump. The explicit string is still the
  right trade — the fingerprint policy was non-deterministic across this
  monorepo's machines and hard-failed builds outright — but the safety net is now
  you.
- **What can ship OTA:** JS/TS, styles, JS-imported assets. **What cannot:**
  anything in the full-build row of the table above.
- **expo-audio (added 2026-07-17):** `src/feedback/feedback.ts` lazy-requires it
  in a try/catch, so binaries built before it degrade to haptics-only instead of
  crashing. That defensive pattern is the right model for any native module
  added under an explicit runtimeVersion.

### Sentry in production

The app initializes Sentry from `EXPO_PUBLIC_SENTRY_DSN`
(`src/observability/sentry.ts`). Since #209 that variable **is** supplied by
`eas.json` for all three build profiles, so production builds report crashes.

If crashes ever stop arriving, check in this order:

1. The DSN is present in the profile's `env` block in `eas.json` (a DSN is not a
   secret — it ships inside every client bundle by design).
2. **EAS-hosted env vars diverge from `eas.json`.** `eas.json` applies to
   *builds*; the EAS-hosted `production` environment applies to `eas update`.
   They have drifted before and caused broken-OTA incidents — reconcile both
   before publishing.
3. `eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN
   --value <dsn> --visibility plain --scope project` sets the hosted one.

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
- **Widget-target bug on EAS remote workers** — originally worked around by
  uploading a locally prebuilt `ios/`. That workaround caused worse problems than
  it solved and is **gone**; the widget target is now handled in config by
  `plugins/withWidgetVersionSync.js`. See
  [Why the recipe changed](#why-the-recipe-changed-2026-09-04).
- **Hardcoded CocoaPods path** — was caused by uploading local Pods. Moot now
  that EAS prebuilds and installs Pods server-side every time.
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

Re-run the [build recipe](#build-recipe-the-important-part) → `eas submit`. The
new build appears in TestFlight and existing internal testers get it
automatically. For JS-only changes, prefer an [OTA update](#ota-updates-eas-update--js-only-changes-in-1-minute)
instead.

`autoIncrement` does **not** handle the build number — it cannot, with a JS
config. `npm run ios:next-build-number` does. See
[Build numbers](#build-numbers).

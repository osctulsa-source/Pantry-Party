# iOS TestFlight — build, submit & distribute

How to get an iOS build into TestFlight. The first successful internal TestFlight
build landed on device on **2026-07-06** (App Store Connect app
**PantryPartyColeTech**). Provisioning of the backend it talks to is in
[`infra/managed/README.md`](../infra/managed/README.md).

**Last known good on device: TestFlight build 47** (2026-09-08). Builds **41–46**
crash on launch. Do not install them. Do not tell testers to.

> **Agents (any machine):** do not invent a shorter path. The recipe below is the
> whole postmortem of 36–46. `eas submit --latest`, `eas update`, a simulator
> Release, or a Linux EAS build without unzipping the IPA are how we shipped
> empty-JS and RelaunchProcedure binaries. Follow this file. Bump
> `LAST_KNOWN_ASC_BUILD` in [`scripts/lib/ios-build-numbers.cjs`](../scripts/lib/ios-build-numbers.cjs)
> after a successful submit.

> **Live-backend note:** the app's `EXPO_PUBLIC_*` endpoints (Supabase, PowerSync
> Cloud, Railway) are baked in **at build time** from the per-profile `env` in
> `eas.json`. A TestFlight build therefore talks to the **live** managed stack —
> make sure the production profile points at prod, not localhost.

## Which path do I need? (decide first)

| You changed… | Ship it via |
|---|---|
| **Anything testers must run** | **Full Mac-local build** — recipe below. OTA is **off**. |
| `app.config.js`, plugins, native deps, widgets, splash/icons | **Full build** (and bump `runtimeVersion` if the native runtime changed). |
| Not sure | Full build. |

OTA (`eas update`) is **disabled** until expo-updates no longer force-unwraps a
nil error at `RelaunchProcedure.swift:94` ([expo/expo#45154](https://github.com/expo/expo/issues/45154)).
Builds **36/41/45** died in ~1s on that path. `updates.enabled` is `false`;
`npm run ota:publish` refuses to run. Re-enable only after upgrading
expo-updates past that unwrap, then cut a **new** binary. 47 stays last-known-good
until that binary exists.

⚠️ **A full build for a native change also needs a `runtimeVersion` bump** in
`app.config.js`. The runtime is an explicit string, not a fingerprint, so it will
not notice on its own.

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

**One path.** Mac-local EAS production, inspect the IPA, submit **that file**.
Simulator Release and EAS cloud are not substitutes: they already produced
different binaries from the same commit (empty `main.jsbundle`, widget v1, the
Sentry `/bin/sh` wrap).

From the repo root, on a Mac with Xcode:

```sh
# 1. Bump the build number (writes ios.buildNumber in app.config.js).
#    Reads App Store Connect + EAS + a committed floor — not only eas build:list.
npm run ios:next-build-number

# 2. If you submitted a previous IPA, bump LAST_KNOWN_ASC_BUILD in
#    scripts/lib/ios-build-numbers.cjs to that stamp, then commit both.

# 3. Commit and push — a build must correspond to a reviewable commit
git add apps/mobile/app.config.js scripts/lib/ios-build-numbers.cjs
git commit -m "chore(ios): build N" && git push

# 4. Gate: provenance, config invariants, ASC-aware build number
npm run ios:preflight

# 5. Mac-local production archive
cd apps/mobile && eas build --platform ios --profile production --local --non-interactive

# 6+7. Inspect then submit THAT ipa (the script refuses --latest)
cd ../..
npm run ios:submit -- apps/mobile/build-<id>.ipa
```

`npm run ios:submit` runs `ios:inspect-ipa` first (JS present, updates off,
widget version = app version) and will not call `eas submit --latest`.

**Do not skip preflight or inspect.** They are the postmortem list. A failed EAS
build wastes 20 minutes and a build number; an un-inspected IPA wastes a
TestFlight slot testers then crash on.

| It checks | Because |
|---|---|
| Working tree is clean | A build must map to a commit. |
| `HEAD` exists on a remote | Builds 42/43 came from commit `f8ebd5c`, which is in neither this repo nor GitHub — the binaries in TestFlight have no reviewable source. |
| `ios.buildNumber` > every stamp on **App Store Connect** (plus EAS + a committed floor) | Local builds 45/46 were on TestFlight while `eas build:list` still said 44. Apple rejects a duplicate `(version, build)` pair *after* the archive. |
| `runtimeVersion` is an explicit string | A fingerprint policy gives every build its own runtime, so no OTA can reach it. |
| `withWidgetVersionSync` is listed **before** `expo-widgets` | Otherwise the widget extension ships `CFBundleVersion 1` against the host app — fatal. Listed *before* so it *runs after*: `@expo/config-plugins` runs the last-registered mod first. |
| Widget bundle id derives from the app bundle id | An extension must live under its host app's id. |
| Production bundle id has no `.dev` suffix | `APP_VARIANT` not applying silently produces an unuploadable binary. |
| `appVersionSource: local`, `autoIncrement: false` | The version scheme this repo can actually support (see below). |
| `.easignore` does not un-ignore `ios/` | Uploading a native project makes EAS skip prebuild and ignore your config. |
| `withForceJsBundleEmbed` is listed **before** Sentry (so it **runs last**) | Build 46: Sentry+PostHog composed `/bin/sh sentry-xcode.sh /bin/sh …`. With `SENTRY_DISABLE_AUTO_UPLOAD=true` Sentry ran `/bin/sh` as the bundler and wrote no JS. |
| `updates.enabled` is false | Builds 36/41/45 abort at `RelaunchProcedure.swift:94` (expo/expo#45154). |

CI also **prebuilds** (`npm run ios:check-embed-phase`) and asserts the generated
pbxproj invokes `embed-jsbundle.sh` and does **not** contain `sentry-xcode.sh` in
the RN bundle phase. Plugin listing is not enough — a Sentry upgrade can restore
the wrap without touching `app.config.js`.

The same config invariants — everything above that does not need network, git, or
Xcode — also run in CI as `apps/mobile/releaseInvariants.test.js`. The rules live
in [`scripts/lib/release-invariants.cjs`](../scripts/lib/release-invariants.cjs).

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
is the single source of truth, `npm run ios:next-build-number` increments it, and
`npm run ios:preflight` refuses to build unless the number is strictly greater
than `max(App Store Connect TestFlight stamps, EAS build:list, LAST_KNOWN_ASC_BUILD)`.

EAS `build:list` alone is not enough. Builds 45 and 46 were Mac-local: they
existed on Apple while EAS still reported 44.

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
and nothing uploads it. Always from `apps/mobile` (a root `expo prebuild` writes
a stray `ios/` and `app.json`):

```sh
cd apps/mobile && APP_VARIANT=production npx expo prebuild --platform ios --no-install
```

### Why Mac-local + inspect (2026-09-08)

EAS cloud, Mac-local, and simulator Release produced **different** binaries from
the same commit. Build **46** was a Mac-local IPA with `updates.enabled: false`
and **no `main.jsbundle`** (Sentry wrapped the RN phase as `/bin/sh`). Inspect
the file you will submit. `npm run ios:submit -- path.ipa` is the only submit
path; `--latest` is refused.

## Submit to App Store Connect

```sh
npm run ios:submit -- apps/mobile/build-<id>.ipa
```

The script inspects the IPA, then submits **that path** with
`APP_VARIANT=production`. It refuses `--latest`, `--id`, and a missing file.

The build processes for a few minutes, then appears under the **TestFlight** tab.
Internal testers get it automatically.

⚠️ **Use the script, not the raw `eas submit`.** Raw `eas submit`:
- without `APP_VARIANT=production` looks up `com.osctulsa.pantryparty.dev`
- `--latest` can upload a binary nobody unzipped (46)

`eas.json`'s per-profile `env` block does **not** cover submit — it applies to
*builds* only. **Any command that reads `app.config.js` outside a build needs
`APP_VARIANT=production` in the shell.** `scripts/submit-ios.sh` and
`scripts/publish-ota.sh` both set it (OTA is still blocked; see below).

> The **Distribution** tab (screenshots, description, "Add for Review") is for the
> **public App Store release** and is **not** required for TestFlight. Ignore it
> until you're doing a public launch.

## OTA updates (EAS Update) — currently OFF

`updates.enabled` is **`false`** in `app.config.js`. Installed TestFlight 47
does not apply published JS updates. `npm run ota:publish` exits 1 until that
flag is flipped **and** expo-updates is past
[expo/expo#45154](https://github.com/expo/expo/issues/45154) **and** a new
binary is cut.

Do not "just OTA" a JS fix. Cut a full build (recipe above).

The rest of this section is the gate for **when OTA is turned back on**. It is
not a current ship path.

`expo-updates` is wired to an **explicit `runtimeVersion` string** (`'1.0.0'` in
`app.config.js`), and the production build profile is on the **`production`
channel**. When enabled, installed TestFlight builds check for published JS
updates and apply them — no new build, no upload, no processing wait.

**Always publish with the script.** It is the only path that runs the
reachability gate (and today it also refuses because updates are off):

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
- **What can ship OTA today:** nothing. `updates.enabled` is false. When that
  is re-enabled *and* a new binary is on testers' phones: JS/TS, styles,
  JS-imported assets. **What cannot:** native modules, plugins, widgets, splash.
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

Re-run the [build recipe](#build-recipe-the-important-part). Existing internal
testers get the new TestFlight build automatically. **Do not prefer OTA** until
updates are re-enabled (see above).

`autoIncrement` does **not** handle the build number — it cannot, with a JS
config. `npm run ios:next-build-number` does. See
[Build numbers](#build-numbers). After submit, bump `LAST_KNOWN_ASC_BUILD`.

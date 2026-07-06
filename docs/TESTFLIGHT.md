# iOS TestFlight — build, submit & distribute

How to get an iOS build into TestFlight. The first successful internal TestFlight
build landed on device on **2026-07-06** (App Store Connect app
**PantryPartyColeTech**). Provisioning of the backend it talks to is in
[`infra/managed/README.md`](../infra/managed/README.md).

> **Live-backend note:** the app's `EXPO_PUBLIC_*` endpoints (Supabase, PowerSync
> Cloud, Railway) are baked in **at build time** from the per-profile `env` in
> `eas.json`. A TestFlight build therefore talks to the **live** managed stack —
> make sure the production profile points at prod, not localhost.

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

**Build numbers:** the production profile's `autoIncrement` in `eas.json` bumps
the build number automatically — no manual edit needed.

## Submit to App Store Connect

```sh
eas submit --platform ios --profile production
```

The build processes for a few minutes, then appears under the **TestFlight** tab.

> The **Distribution** tab (screenshots, description, "Add for Review") is for the
> **public App Store release** and is **not** required for TestFlight. Ignore it
> until you're doing a public launch.

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
automatically.

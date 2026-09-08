# Agent notes

This repo is a pantry tracker (codename Breadbox). Product and architecture rules live in [`.cursorrules`](.cursorrules). Do not hardcode a product name in the UI.

## iOS TestFlight — read this before shipping

**Last known good on device: TestFlight build 47.** Builds 41–46 crash. OTA is off.

Do not invent a shorter path. Follow [`docs/TESTFLIGHT.md`](docs/TESTFLIGHT.md). The gates exist because builds 36–46 shipped empty JS, the wrong binary (`eas submit --latest`), fingerprint runtimes, widget version 1, and expo-updates `RelaunchProcedure.swift:94` aborts.

Required recipe (Mac):

```sh
npm run ios:next-build-number   # then commit + push
npm run ios:preflight
cd apps/mobile && eas build --platform ios --profile production --local --non-interactive
npm run ios:submit -- apps/mobile/build-<id>.ipa
```

Hard bans:

- Never `eas submit --latest`. Inspect then submit one IPA (`npm run ios:submit` refuses `--latest` and inspects first).
- Never `eas update` / `npm run ota:publish` while `updates.enabled` is false (expo/expo#45154). JS changes wait for a full binary.
- Never treat simulator Release as TestFlight.
- After a successful submit, bump `LAST_KNOWN_ASC_BUILD` in `scripts/lib/ios-build-numbers.cjs`.
- `expo prebuild` only from `apps/mobile` with `APP_VARIANT=production`. Never from the repo root.

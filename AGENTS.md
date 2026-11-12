# AGENTS.md — read this first

Rules for every AI tool in this repo (Claude Code, Cursor, Antigravity, Codex, Grok…).
CLAUDE.md points here, so there is one copy.

## Working on this project

JC works from several devices and AI tools. These rules keep them all on the same plan.

1. **Start:** `git pull`, then read [docs/STATUS.md](docs/STATUS.md). Its **Now** section is the
   one thing being worked on.
2. **Stay on it.** If JC asks for something else, do it, but say it's off-plan and offer to add
   it to STATUS.md. New ideas go in the **Parking lot**, not the code.
3. **Finish:** update STATUS.md (Now, Next, a session-log line), then commit and push so the
   next device or tool picks up where you stopped.

# Agent notes

This repo is the Pantry Glance pantry tracker (codename Breadbox in package names and ids). Product and architecture rules live in [`.cursorrules`](.cursorrules). Do not hardcode a product name in the UI.

## iOS TestFlight — read this before shipping

**Last known good on device: TestFlight build 50.** Builds 41–46 crash. OTA is off.

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

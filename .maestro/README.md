# Maestro smoke flows — device smoke checks

Five minutes of automation that catches the bug classes device testing kept
finding after the fact: dead buttons, unreachable content, clipped labels,
broken navigation.

## When to run

**Before every TestFlight submit.** OTA updates are disabled; do not run
`eas update`. Follow `docs/TESTFLIGHT.md` for the full-binary release gates. These flows
exist because the settings-overflow, dead-cook-mode-X, and clipped-chip bugs
all shipped to TestFlight and were found by a human. Each flow pins the
regression class that escaped.

## Prerequisites (one-time per machine)

- `brew install maestro` (or `curl -fsSL https://get.maestro.mobile.dev | bash`)
- An iOS simulator with the **dev build** installed
  (`npm run ios` from `apps/mobile/` builds + installs it), **signed in** to a
  test account whose household has a few pantry items.

## Run

```sh
# from the repo root, with the sim booted:
npm run smoke        # runs every flow in .maestro/
# or a single flow:
maestro test .maestro/02-settings-scroll.yaml
```

## Flows

| Flow | Guards against |
|---|---|
| `00-launch` | app fails to boot |
| `01-tabs` | a tab crashes on mount / navigation breaks |
| `02-settings-scroll` | bottom-of-screen content unreachable (settings overflow) |
| `03-pantry-zones` | zone chips unreadable/untappable, filter breaks the list |
| `04-cook-mode-exit` | cook mode traps the user (dead close button) |

`04` depends on recipes loading from the network — treat a failure there as a
yellow flag (verify by hand) rather than an automatic red.

## Writing new flows

Prefer `accessibilityLabel` text as tap targets (stable across copy tweaks),
`extendedWaitUntil` over fixed sleeps, and one regression class per flow with
a comment naming the bug it pins.

## Product acceptance checks

See [the demo and device validation guide](../docs/portfolio/DEMO.md) for offline
persistence, reconnect delivery, capture correction, household joining, and session
cleanup. These multi-device checks are manual; the smoke flows above do not establish
end-to-end sync correctness.

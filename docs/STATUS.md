# STATUS — where this project is right now

Every AI tool reads this first and updates it at the end of a session. Keep it short.

## Now

**Cut the next TestFlight build (51) on the Mac**, following [TESTFLIGHT.md](TESTFLIGHT.md).
It carries everything merged since build 50: the sync-wedge fix, the push-token fix,
`api.pantryglance.com`, the pantryglance.com links, and (once PR #281 is merged) the
later notification prompt. Then check on the phone: sync between two devices, the
notification prompt appears only after dating an item, Settings links open pantryglance.com.

## Next

- App Store listing: demo account, age rating, category, legal entity, screenshots, and a
  release version (still 0.0.1). See [APPSTORE-METADATA.md](APPSTORE-METADATA.md).
- Off-site database backups (scheduled dump to Cloudflare R2) and fill in [BACKUP-DR.md](BACKUP-DR.md).
- Run the staging acceptance check in [../infra/managed/STAGING.md](../infra/managed/STAGING.md)
  from a development build on a phone connected to Tailscale.
- Upgrade zod 3 → 4 in the API (last open audit advisory).
- Review the open Dependabot PRs; the Expo group (#274) should ride with a deliberate build.

## Blocked on JC

- Send a test email to support@ and privacy@pantryglance.com and confirm both arrive.
- Confirm "Confirm email" is on in the production Supabase project (Authentication settings).
- Tell the agent which Supabase plan production is on and how often to back up.
- App Store listing decisions (see Next).

## Parking lot

Ideas to do later. Write them here instead of building them now.

- Invite links that open the app from `pantryglance.com/join/...`.
- A "turn on notifications" control in Settings for people who are never prompted.
- Cloud staging (PowerSync Cloud + Railway) if the desktop stack becomes limiting.
- PowerSync's free plan stops the instance after 7 idle days (it did, Sep 10 – Nov 12).
  Move to a paid plan or add a keep-alive before public launch.
- Retire the Railway `legal` service once builds up to 50 are gone.

## Session log

Newest first. One line each: date — tool — what changed.

- 2026-11-12 — Claude Code — Merged #270–#273, #279, #280 (sync and API fixes, deps, site on Cloudflare at pantryglance.com, desktop staging, api.pantryglance.com, build 50 docs). Opened #281 (notification prompt timing). Production PowerSync redeployed after being stopped.
- 2026-11-12 — project-init — Set up the repo, AGENTS.md and this file.

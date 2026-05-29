# @breadbox/api

Backend skeleton. Stays a stub until Phase 1. Deliberately thin — the mobile app is the
product; the backend is plumbing.

## Responsibilities (Phase 1)

- **Auth handoff** — validate Auth0/Clerk tokens; no homegrown auth.
- **Sync backend** — whatever the chosen engine (PowerSync/Replicache) needs server-side.
- **Partner-API proxy** — Spoonacular, Instacart, OCR. Keys live HERE, never in the mobile
  bundle. The app calls our proxy; the proxy calls the partner.
- **Postgres on RDS** — per-household row partitioning from the first migration.

## Explicitly NOT here

Business logic that belongs on-device (the pantry is local-first). The backend is a sync
target and a key vault, not the brain.

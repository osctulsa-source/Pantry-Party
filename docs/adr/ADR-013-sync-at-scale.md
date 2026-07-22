# ADR-013 · Sync at scale: bucket shape & history-volume findings

**Status:** Accepted (findings + recommendations) · **Date:** 2026-07-22
**Related:** ADR-003 (PowerSync), ADR-010 (op-sqlite client), the sync rules in
[`infra/local-dev/sync-config.yaml`](../../infra/local-dev/sync-config.yaml).

Recorded **before** real data volume exists, so the growth-sensitive parts are
known and cheap to address rather than discovered under load.

## Current sync-rule shape (verified)

Edition-3 streams, all household-scoped via `auth.user_id()`:

- **`household_members`** — the user's memberships + co-members', one subquery.
- **`household_data`** — 7 queries (`pantry_items`, `households`,
  `shopping_list_items`, `favorite_recipes`, `activity_events`, `announcements`,
  `announcement_reactions`), each `WHERE household_id IN (SELECT household_id
  FROM user_households WHERE user_id = auth.user_id())`. PowerSync implicitly
  buckets per `(user, household)`.
- **`user_invites`**, **`user_push_tokens`** — strictly the caller's own rows.

The **tenancy shape is correct and efficient**: a device only ever downloads
rows for households it belongs to, and secrets (push tokens) / invites never
cross to co-members. No `FOR ALL TABLES` publication (the outer wall is an
explicit 10-table list). This part scales fine.

## Growth-sensitive findings

The risk is **not** tenancy — it's **unbounded per-household history** riding in
the same buckets a device must fully hydrate:

1. **Append-only history tables grow without bound.** `activity_events`,
   `announcements`, and `announcement_reactions` only ever accumulate. Their
   bucket for a long-lived household eventually contains thousands of rows, and
   a fresh device (or a re-sync after a checkpoint reset) downloads the whole
   history before the app is usable. `pantry_items` / `shopping_list_items` are
   bounded by *current* household size — but see (2).

2. **Tombstones are never purged.** Mobile "delete" is `deleted = true`, and
   nothing removes old tombstones. A household with heavy add/remove churn
   accumulates dead rows that still replicate and still count against every
   device's initial sync. Over months this is the most likely first pain point.

3. **Bucket count = users × households.** Fine at household scale (most users in
   1–2 households), but worth remembering the multiplier exists before any
   "join many households" feature.

## Recommendations (do before real volume, not after)

- **Cap or window the history streams.** Sync only recent `activity_events` /
  `announcements` (e.g. last 90 days or last N per household) and treat older
  rows as server-only history surfaced via an API call, not a synced bucket.
  This keeps the hot path bounded regardless of household age.
- **Add a tombstone reaper.** A periodic server job that hard-deletes rows with
  `deleted = true AND updated_at < now - <retention>` across the household
  tables, so replication and initial-sync payloads stay proportional to *live*
  data. Coordinate the cutoff with the slowest expected client re-sync interval
  so a long-offline device still sees the tombstone before it's purged.
- **Add a sync-drain load check to CI/QA before launch.** An
  offline→online→re-sync flow (the audit's P3 suggestion) that asserts payload
  size stays bounded as history grows — cheap insurance the above stays true.
- **Keep the explicit publication + per-household subquery pattern.** They are
  the parts that are right; don't regress to `FOR ALL TABLES` or client-supplied
  parameters for scoping.

## Consequences

No change today — this is a findings record. The history-windowing and
tombstone-reaper items become real work items before a public launch; both are
additive and backward-compatible.

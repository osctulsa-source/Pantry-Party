# Household announcements — design

**Date:** 2026-07-10
**Status:** Approved, ready for implementation planning

## Summary

Two cross-user notification flows for a household, delivered as real push
notifications plus an in-app surface:

1. **Shopping run** — a member announces "I'm heading to the store soon,"
   housemates get pushed and can add items to the shared list before the runner
   leaves. The runner gets one batched ping summarizing additions near departure.
2. **Cooking commitment** — a member taps "I'm making this" on a recipe;
   housemates are notified that dinner is being handled.

Both ride the same substrate: a synced `announcements` table whose inserts, when
drained through the Railway upload proxy, trigger a server-side Expo push
fan-out to the household.

## Decisions (from brainstorming)

- **Delivery:** real push notifications (not in-app only).
- **Scope:** both flows this effort; shopping run built first.
- **Shopping run flow:** announce with a time window (chips), not a per-run
  snapshot object. Still one shared household list.
- **Audience:** always the whole household except the sender. No recipient
  picker in v1.
- **Cook commitment:** "I'm making this" button on a recipe → announcement (not
  a claimed dinner slot, not a Cook-Mode-start trigger).
- **Tap action:** deep-link to the relevant screen + in-app reaction chips
  (👍 / 🎉 / "can't tonight") the sender can see.
- **Runner pings:** yes, batched — at most one summary push near departure, plus
  a live count in-app. Not per-item.
- **Architecture:** Option A — hook the existing upload proxy. Announcements are
  a normal synced table; fan-out fires when the row reaches Postgres. Offline
  correct (queues and pushes on sync), sender already authenticated, push and
  in-app feed derive from the same row so they cannot disagree.

## Data model

### New synced table: `announcements`

Synced to the household bucket, same tenancy pattern as `activity_events`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | client-generated |
| `household_id` | uuid | tenancy |
| `kind` | text | `'shopping_run'` \| `'cooking'` |
| `created_by` | text | JWT sub of sender; server enforces == added_by |
| `created_at` | timestamptz | ISO from client |
| `status` | text | `'active'` \| `'done'` \| `'canceled'` (default `'active'`) |
| `departs_at` | timestamptz | shopping_run only — from window chips |
| `store_hint` | text | shopping_run only, optional |
| `recipe_id` | text | cooking only |
| `recipe_title` | text | cooking only |
| `image` | text | cooking only, optional |
| `runner_summary_sent_at` | timestamptz | server-stamped; guards double batch-ping |
| `updated_at` | bigint | sync bookkeeping, mirrors other tables |
| `deleted` | boolean | tombstone |

### New synced table: `announcement_reactions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | |
| `announcement_id` | uuid | fk to announcements |
| `household_id` | uuid | tenancy |
| `user_id` | text | reactor (JWT sub) |
| `reaction` | text | `'thumbs_up'` \| `'party'` \| `'cant_tonight'` |
| `created_at` | timestamptz | |
| `updated_at` | bigint | |
| `deleted` | boolean | |

Reactions reach the sender via normal sync only. No push per reaction in v1.

### New table: `push_tokens`

Scoped to a **user-only** PowerSync bucket so members never see each other's
tokens.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | |
| `user_id` | text | owner (JWT sub) |
| `token` | text | Expo push token |
| `platform` | text | `'ios'` \| `'android'` |
| `announcements_enabled` | boolean | Settings toggle, default true |
| `updated_at` | bigint | |
| `deleted` | boolean | tombstoned on DeviceNotRegistered |

### Column add: `shopping_list_items.run_id`

Nullable uuid → the active run's announcement id. `addToShoppingList` stamps new
items with the active run id while a run is live, so the runner's screen can
group "Requested for this run" and the batch ping can count them. No new list
machinery; still one household list.

## Server: push fan-out

New self-contained module `services/api/src/push/` using `expo-server-sdk`,
deliberately decoupled from upload-proxy internals so it survives the ADR-008
backend replacement.

- **On `announcements` INSERT** applied by the proxy: call
  `fanOutAnnouncement(row)` — look up `user_households` members at send time (so
  departed members are excluded), fetch each member's enabled push tokens, send
  Expo pushes to everyone except `created_by`. `DeviceNotRegistered` receipts
  tombstone the token.
- **Batched runner ping:** a once-a-minute sweep finds active runs where
  `departs_at` is within ~5 minutes, `runner_summary_sent_at` is null, and
  requested items exist → one push to the runner ("2 housemates added 5 items"),
  then stamps `runner_summary_sent_at`. State lives in the DB, so it survives API
  restarts.
- **Stale-queue guard:** if an announcement drains in with `departs_at` more than
  ~1 hour in the past (phone was offline), the row still syncs but no pushes fire.
- Fan-out is fire-and-forget with logging; it never blocks the upload response.
  The synced row is the source of truth, not the push.

The upload proxy must add `announcements`, `announcement_reactions`, and
`push_tokens` to `KNOWN_TABLES` / `ALLOWED_COLUMNS`, and add the `run_id` column
to `shopping_list_items`.

## Client

- **Token registration:** after login + notification permission (the expiry
  feature already runs the permission flow), obtain the Expo push token and
  upsert into `push_tokens`.
- **Announce a run:** button on the Shopping screen → sheet with window chips
  (Now / 30 min / this afternoon / tonight), optional store, "Notify household."
  Writes the announcement row locally; PowerSync + proxy do the rest.
- **"I'm making this":** button on Recipe Detail and the Cook This card → confirm
  sheet → cooking announcement. Also records an `activity_events` row so it shows
  in History.
- **Push handling:** notification tap deep-links via the existing
  `navigationRef` — shopping run → Shopping tab; cooking → Recipe Detail.
- **In-app surface:** active-announcement card atop the Shopping screen ("Sam is
  heading to Kroger at 5:00 — 3 requests · Add something") and on the Recipes
  screen for cooking ("Alex is making Chicken Tikka tonight"), each with reaction
  chips. Sender sees reaction avatars/counts on the same card.
- **Lifecycle:** runner taps "Done" (or "Clear checked" offers it) →
  `status='done'`; runs auto-expire ~4h after `departs_at`, cooking
  announcements at end of day. Expired/done cards disappear.
- **Settings:** "Household announcements" toggle (on by default) flips
  `announcements_enabled` on the user's push token row.

## Error handling & edge cases

- Offline announce queues and syncs later, guarded by the stale-push check.
- Invalid/rotated tokens tombstoned on receipt errors.
- A user with notifications off still sees everything in-app via sync.
- Fan-out failure never blocks the upload response or corrupts the synced row.

## Testing

- **`packages/core` (vitest):** announcement schema + parse, window-label
  formatting, recipient computation (household minus sender), batch-ping
  eligibility — mirroring the pure-reconciler pattern in `notifications.ts`.
- **API (`services/api`):** route tests alongside `household.test.ts` for the
  fan-out hook with the Expo client mocked, and the batch-sweep eligibility.
- **Manual QA:** actual push delivery and deep-link on a physical dev build.
  Verify with `apps/mobile` tsc (root typecheck is known-broken).

## Out of scope (v1)

- Recipient picker / targeting individuals.
- Per-reaction push notifications.
- Per-run snapshot objects / run history.
- Cross-household announcements.

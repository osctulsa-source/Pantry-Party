# ADR-012 · Offline conflict resolution: field-level last-writer-to-sync-wins

**Status:** Accepted (documents current behavior) · **Date:** 2026-07-22
**Extends:** the `docs/DECISIONS.md` ADR series · **Related:** ADR-002
(offline-first), ADR-011 (per-device pantry quantity — *proposed, not built*).

This ADR was written by reading the code, not the intent — it records what the
system *actually does today* when two household members edit the same row
offline and both later sync.

## Context

Two members share a household. Both go offline, both edit the same
`pantry_items` (or `shopping_list_items`) row, then both reconnect. PowerSync
drains each device's local CRUD queue to `POST /sync/upload`. What wins?

## Current behavior (verified in code)

The write path has two shapes, and the answer differs by which fires:

- **Edits are `PATCH` ops carrying only the changed columns.** A local `UPDATE`
  in SQLite becomes a PowerSync CRUD `PATCH` with just the touched fields.
  `handlePatchPantryItem` ([services/api/src/routes/upload.ts](../../services/api/src/routes/upload.ts))
  issues `UPDATE <table> SET <only those columns> WHERE id = $n` — it never
  touches columns the payload didn't include.
- **There is no `updated_at` guard.** The `UPDATE` (and the `PUT` upsert's
  `ON CONFLICT DO UPDATE SET col = EXCLUDED.col`) applies unconditionally. No
  `WHERE updated_at <= EXCLUDED.updated_at`, no vector clock, no CRDT.

So the effective semantics are **field-level, last-writer-to-*sync*-wins**:

1. Two members editing **different fields** of the same row (A changes
   `quantity`, B changes `location`) → **both survive**. Each PATCH sets only
   its own column; they merge.
2. Two members editing the **same field** → the PATCH that **reaches the server
   last wins**. "Last" is *sync arrival order*, **not wall-clock edit time** —
   an edit made earlier can clobber a later one if it happens to sync second
   (e.g. the member who edited first reconnects last).
3. `deleted` is just another field (mobile delete = `PATCH deleted = true`), so
   a delete and a concurrent edit resolve the same way: whichever syncs last
   wins. An edit that syncs after a delete "undeletes" the field it set but
   leaves `deleted = true` unless it also carried `deleted`.

`updated_at` is written by clients but is currently **decorative** for conflict
purposes — it is not consulted when applying a write.

## Is this acceptable?

**For now, yes** — with eyes open. Simultaneous *same-field* offline edits to
the *same* item by two members of a small household are rare, and field-level
merge already handles the common "we both touched the item, but different
attributes" case gracefully. This is a deliberate-enough default, but it was
never explicitly decided — hence this ADR.

The sharp edge is **arrival-order, not edit-time**: a stale edit that syncs late
silently overwrites a fresher one, with no signal to either user. At household
scale this is a rare annoyance; it is not data *loss* of the row, only of one
field's newer value.

## Recommendation

1. **Keep field-level LWW as the baseline.** It matches the offline-first goal
   and needs no CRDT machinery.
2. **If arrival-order clobbering starts to bite, upgrade same-field resolution
   (⚠️ see the 2026-09-23 addendum — do not ship the row-level form below)
   to "newest edit wins"** by making the write conditional on the client
   timestamp: `... WHERE id = $n AND updated_at <= $incoming_updated_at` (and
   the upsert's `DO UPDATE ... WHERE <table>.updated_at <= EXCLUDED.updated_at`).
   This is a localized change in `handlePatchPantryItem` / `buildUpsertSql` and
   turns `updated_at` from decorative into load-bearing.
3. **`pantry_items.quantity` is the known special case** — see ADR-011's proposal
   to replace LWW on quantity with idempotent per-device contributions (marked
   *not implemented* there). Until that lands, quantity follows the LWW rule
   above: two members each setting a new absolute quantity → last sync wins, and
   neither device's decrement is additive. Flag this before any "shared live
   count" UX promises additivity.

### Addendum (2026-09-23) — the row-level guard in step 2 is a trap

On review, the one-line guard proposed in step 2 (`WHERE updated_at <= $incoming`)
is **not** a strict improvement and should not ship as written:

- **It breaks case 1.** `updated_at` is one stamp per *row*. A stale PATCH that
  touched a *different* field (A edits `quantity` at t=10, B edits `location` at
  t=20 and syncs first) would be dropped whole — today both edits merge. The guard
  trades a rare same-field clobber for a rare different-field loss.
- **It makes device clocks load-bearing.** A phone whose clock runs slow would
  have genuinely newer edits silently discarded; one running fast would win
  every conflict until real time catches up.
- **It needs to be silent.** A stale write must return 200 (skip), never 4xx —
  PowerSync retries a rejected batch forever.

If arrival-order clobbering is ever observed in practice, the correct shape is
**per-field** newest-edit-wins, which preserves case 1:

1. Migration: server-only `field_updated_at JSONB NOT NULL DEFAULT '{}'` on
   `pantry_items` and `shopping_list_items` (not in the PowerSync client schema;
   additive, no backfill — a missing key reads as 0, i.e. "always apply").
2. In `handlePatchPantryItem`, clamp the stamp to
   `LEAST($incoming_updated_at, server_now_ms + 60000)` so a fast clock can't
   pin a field, then for each column in the PATCH:
   `col = CASE WHEN COALESCE((field_updated_at->>'col')::bigint, 0) <= $ts THEN $v ELSE col END`,
   and merge `field_updated_at || jsonb_build_object('col', GREATEST(old, $ts))`.
   Postgres evaluates every SET expression against the old row, so this is one
   statement and stays idempotent on replay.
3. Deploy order: apply the migration **before** the API (API deploys are manual
   `railway up`; the new SQL 500s every PATCH if the column is missing). Land it
   on staging first.
4. Real-DB tests in `services/api/src/__integration__`: different-field merge,
   same-field stale drop, replay idempotence, future-clock clamp.

`quantity` stays the exception either way (ADR-011): newest-edit-wins on an
absolute count still loses a concurrent decrement.

**Decision:** keep current field-level last-writer-to-sync-wins until telemetry or
tester reports show same-field clobbering. Revisit with the per-field design above.

## Consequences

- No new dependencies or schema today; behavior is documented and testable (the
  real-DB upload round-trips in `services/api/src/__integration__` already
  exercise the PATCH field-level path).
- A future "newest-edit-wins" or per-device-contribution upgrade is
  backward-compatible (clients already send `updated_at`).

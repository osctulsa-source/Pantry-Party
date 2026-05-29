# Architecture — the walking skeleton

The Phase 1 goal is a **walking skeleton**: the thinnest possible end-to-end slice that
exercises every architectural layer for exactly one item. If one item can travel the
whole path reliably, the architecture is proven and features become fill-in-the-blanks.

## The one-item journey

```
  ┌─────────────┐   capture    ┌──────────────┐   write    ┌──────────────┐
  │   Camera /  │ ───────────▶ │  Capture     │ ─────────▶ │  Local store │
  │   Receipt   │   barcode    │  Engine      │  PantryItem│  (SQLite)    │
  └─────────────┘   or OCR     └──────────────┘            └──────┬───────┘
                                                                  │ background sync
                                                                  ▼
  ┌─────────────┐   findByIngredients   ┌──────────────┐   change feed   ┌──────────┐
  │  Cook This  │ ◀──────────────────── │  Sync engine │ ◀────────────── │ Postgres │
  │  surface    │   (Spoonacular)       │  (PowerSync/  │   per-household │  (RDS)   │
  └─────────────┘                       │   Replicache) │   partition     └──────────┘
                                        └──────────────┘
```

## Layers

1. **Capture** (`apps/mobile/src/features/capture`) — barcode/OCR/manual → a validated
   `PantryItem` (schema from `packages/core`). Resolves names via the barcode cascade.
2. **Local store** — SQLite via WatermelonDB. Source of truth for the UI. Always available.
3. **Sync engine** — chosen in Phase 0. Pushes local changes, pulls a per-household change
   feed, applies the conflict policy (see below). Invisible to the UI.
4. **Backend** (`services/api`) — Postgres on RDS, per-household row partitioning from day
   one. Thin: auth handoff, sync backend, partner-API proxy (keep keys server-side).
5. **Cook This** (`apps/mobile/src/features/cook`) — reads local pantry state, calls
   Spoonacular `findByIngredients`, ranks by expiration urgency × pantry match.

## Sync conflict policy (v1)

| Field | Policy |
|-------|--------|
| Most fields | Last-write-wins (timestamped) |
| `quantity` on co-add | Sum (two people bought milk → 2 units, not 1) |
| `expiresAt` | Earliest date wins (safer) |
| Deletion | Tombstone; propagates on reconnect |

## Walking-skeleton checklist (Phase 1 exit)

- [ ] Scan one barcode → resolved name → `PantryItem` in local SQLite
- [ ] Item survives an app restart (local persistence works)
- [ ] Item syncs to Postgres and back to a second device in < 5s
- [ ] Kill the network, add an item, restore network → item syncs, no loss
- [ ] That one item produces at least one Spoonacular recipe match on the Cook This surface
- [ ] The whole slice runs in CI against a simulator

Once every box is checked, the architecture is real and Phase 2 features begin.

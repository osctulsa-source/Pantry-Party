# Spike · Offline-first sync

**Question:** Can we build offline-first sync that **never loses data**? **Throwaway. Timebox: ~2 weeks** (the deeper of the two spikes).

## Run it

```bash
npm install
npm test
```

You'll see five scenarios pass against the in-memory reference engine.

## What it proves

`tortureTest.ts` runs five data-loss scenarios:

1. **Offline writes survive reconnect** — 30 items added offline, all present after sync
2. **Cold restart loses nothing** — item survives a serialize/drop/restore cycle (app update)
3. **Concurrent add accumulates** — two devices add milk offline → quantity 2, *not 1*. This
   is THE test. Naive last-write-wins silently loses one add; that's KitchenPal's class of bug.
4. **Delete propagates** — an offline device honors a remote tombstone on reconnect
5. **1000 cycles, no drift** — rapid updates + periodic restarts, quantity stays correct

## The subtle correctness point

Quantity is modeled as a **per-device contribution map merged by max**, not a number you
sum. Merges must be idempotent — re-syncing the same write must be a no-op — or the count
drifts. See the comment block in `syncEngine.ts`. This is the single trickiest piece of
logic in the product; the spike exists partly to make the team internalize it.

## The actual decision (ADR-003)

The reference engine passing is table stakes. The real work:

1. Write a `PowerSyncEngine` adapter satisfying `SyncEngine`.
2. Write a `ReplicacheEngine` adapter satisfying `SyncEngine`.
3. Point **these same five scenarios** at each.
4. Decide on: zero-loss (mandatory) → conflict ergonomics → cost at 50K–200K MAU → RN/Expo fit.

Log the winner in `../../docs/DECISIONS.md`, then **delete this directory.**

# Spike · Offline-first sync

**Question:** Can we build offline-first sync that **never loses data**?
**Throwaway. Timebox: ~2 weeks** (the deeper of the two spikes).

## Run it

```bash
npm install
npm test                    # MemoryEngine — the reference; expect 7 passed · 0 failed
```

Then, after [setup-powersync.md](setup-powersync.md):

```bash
npm install                 # picks up cross-env + @powersync/node
npm run test:powersync      # PowerSync adapter — same 7 scenarios, real engine
```

## What it proves

`tortureTest.ts` runs five data-loss scenarios:

1. **Offline writes survive reconnect** — 30 items added offline, all present after sync
2. **Cold restart loses nothing** — survives serialize/drop/restore (app update)
3. **Concurrent add accumulates** — two devices add milk offline → quantity 2, *not 1*. THE test
4. **Delete propagates** — an offline device honors a remote tombstone on reconnect
5. **1000 cycles, no drift** — rapid updates + restarts, quantity stays correct

## The subtle correctness point

Quantity is modeled as a **per-device contribution map merged by max**, not a number you
sum. Merges must be idempotent — re-syncing the same write must be a no-op. See the
comment block in `syncEngine.ts`. This is the single trickiest piece of logic in the
product; the spike exists partly to make the team internalize it.

## Files

```
src/
  syncEngine.ts        — interface + canonical mergeItems()
  memoryEngine.ts      — reference engine (correct by construction)
  powerSyncEngine.ts   — adapter scaffold (TODOs; see setup-powersync.md)
  tortureTest.ts       — engine-agnostic runner; switches on ENGINE env var
setup-powersync.md     — step-by-step to set up Supabase + PowerSync + fill the adapter
```

## The decision (ADR-003)

The memory engine passing is table stakes. The real work:

1. Fill in `powerSyncEngine.ts` per `setup-powersync.md`, get `test:powersync` green
2. Repeat for Replicache when it's its turn
3. Decide on: zero-loss (mandatory) → conflict ergonomics → cost at 50K–200K MAU → RN/Expo fit
4. Log the winner in `../../docs/DECISIONS.md`, then **delete this directory**

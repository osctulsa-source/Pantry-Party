/**
 * Phase 0 — offline-sync spike · Torture test, engine-agnostic
 *
 *   npm test                       # MemoryEngine (reference)
 *   ENGINE=powersync npm test      # PowerSync adapter (after setup-powersync.md)
 *   ENGINE=replicache npm test     # Replicache adapter (future)
 *
 * Five scenarios that try to make the engine lose data. An engine that can't pass all
 * five does not get to be our production engine. THROWAWAY.
 *
 * Every engine call below is awaited so the runner works for both sync engines
 * (MemoryEngine — await of a non-Promise is a no-op) and async ones (PowerSync,
 * Replicache — where ordering matters). Don't drop the awaits even though the
 * memory engine doesn't need them.
 */

import { quantityOf, type StoredItem, type SyncEngine } from "./syncEngine.ts";
import { MemoryEngine } from "./memoryEngine.ts";
import { PowerSyncEngine } from "./powerSyncEngine.ts";

const engineChoice = (process.env.ENGINE ?? "memory").toLowerCase();

interface World {
  /** May return sync (MemoryEngine) or a Promise (PowerSync, Replicache). Always `await`. */
  newEngine(device: string): SyncEngine | Promise<SyncEngine>;
  serverSize(): number;
  describe: string;
}

function makeWorld(): World {
  if (engineChoice === "memory") {
    const server = new Map<string, StoredItem>();
    return {
      describe: "MemoryEngine (reference)",
      newEngine: (device) => new MemoryEngine(server, device),
      serverSize: () => server.size,
    };
  }
  if (engineChoice === "powersync") {
    return {
      describe: "PowerSyncEngine — requires setup-powersync.md to be done",
      newEngine: (device) => new PowerSyncEngine(device),
      // Server "size" via PowerSync = round-trip query against Postgres. Not used as a
      // pass/fail; we keep MemoryEngine's S1 assertion local to this runner.
      serverSize: () => -1,
    };
  }
  throw new Error(`unknown ENGINE=${engineChoice} — use memory | powersync`);
}

// ── Harness ──────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}
const t = (n: number) => 1000 + n;

async function run() {
  const world = makeWorld();
  console.log(`\n  Offline-sync torture test · ${world.describe}\n  ─────────────────────────`);

  // S1 — offline writes survive reconnect
  {
    const a = await world.newEngine("A");
    await a.setOnline(false);
    for (let i = 0; i < 30; i++) await a.add({ id: `s1-${i}`, name: `item ${i}`, quantity: 1 }, t(i));
    await a.setOnline(true);
    await a.sync();
    assert((await a.read()).length === 30, "S1 · 30 offline writes survive reconnect");
    if (engineChoice === "memory") assert(world.serverSize() === 30, "S1 · all 30 reached the server");
  }

  // S2 — cold restart (app update) loses nothing
  {
    const a = await world.newEngine("A");
    await a.add({ id: "s2", name: "olive oil", quantity: 1 }, t(1));
    await a.restart();
    assert((await a.read()).some((i) => i.id === "s2"), "S2 · item present after cold restart");
  }

  // S3 — concurrent add of the same item accumulates (THE data-loss test)
  {
    const a = await world.newEngine("A");
    const b = await world.newEngine("B");
    await a.setOnline(false); await b.setOnline(false);
    await a.add({ id: "milk", name: "milk", quantity: 1 }, t(1));
    await b.add({ id: "milk", name: "milk", quantity: 1 }, t(2));
    await a.setOnline(true); await a.sync();
    await b.setOnline(true); await b.sync();
    await a.sync();
    const milk = (await a.read()).find((i) => i.id === "milk");
    assert(!!milk && quantityOf(milk) === 2, "S3 · concurrent adds sum to 2 (no lost update)");
  }

  // S4 — delete while offline propagates as a tombstone
  {
    const a = await world.newEngine("A");
    const b = await world.newEngine("B");
    await a.add({ id: "s4", name: "parsley", quantity: 1 }, t(1));
    await b.sync(); // B sees parsley
    await b.setOnline(false);
    await a.del("s4", t(5));
    await b.setOnline(true); await b.sync();
    assert(!(await b.read()).some((i) => i.id === "s4"), "S4 · offline device honors the remote delete");
  }

  // S5 — 1000 update cycles + periodic restarts, no drift
  {
    const a = await world.newEngine("A");
    for (let i = 0; i < 1000; i++) {
      await a.add({ id: "hot", name: "hot item", quantity: 1 }, t(i));
      if (i % 50 === 0) await a.restart();
    }
    const hot = (await a.read()).find((i) => i.id === "hot");
    assert(!!hot, "S5 · item survives 1000 cycles + restarts");
    assert(!!hot && quantityOf(hot) === 1, "S5 · quantity stays 1 (idempotent — no drift)");
  }

  console.log("\n  ─────────────────────────");
  console.log(`  ${passed} passed · ${failed} failed`);
  console.log(failed === 0
    ? `\n  ${engineChoice === "memory" ? "Reference passes. Try ENGINE=powersync once setup-powersync.md is done." : `${engineChoice} passes. Log the ADR.`}\n`
    : "\n  ⚠ Failed — see scenario above; the conflict/persistence model has a hole.\n");
  process.exit(failed === 0 ? 0 : 1);
}

run();

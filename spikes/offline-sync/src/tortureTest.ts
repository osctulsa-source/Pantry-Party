/**
 * Phase 0 — Offline-sync spike · The torture test
 *
 * Five scenarios that try to make the engine lose data. An engine that can't pass all
 * five does not get to be our production engine.
 *
 *   npm test
 *
 * The MemoryEngine below is a correct-by-construction REFERENCE (verified: all scenarios
 * pass) so the test is runnable today. The real deliverable: write a PowerSync adapter
 * and a Replicache adapter that satisfy SyncEngine, point THESE scenarios at each, and
 * pick the one that survives with the least ceremony (ADR-003).
 *
 * THROWAWAY.
 */

import { mergeItems, quantityOf, type ItemInput, type StoredItem, type SyncEngine } from "./syncEngine.ts";

// ── Reference engine: a shared "server" + per-device local replicas, all in memory ──
class MemoryEngine implements SyncEngine {
  private local = new Map<string, StoredItem>();
  private queue: StoredItem[] = [];
  private online = true;
  constructor(private server: Map<string, StoredItem>, private device: string) {}

  add(input: ItemInput, at: number) {
    this.upsert({
      id: input.id,
      name: input.name,
      qty: { [this.device]: input.quantity },
      expiresAt: input.expiresAt,
      updatedAt: at,
      updatedBy: this.device,
    });
  }
  del(id: string, at: number) {
    const ex = this.local.get(id);
    this.upsert({ id, name: ex?.name ?? "", qty: ex?.qty ?? {}, deleted: true, updatedAt: at, updatedBy: this.device });
  }
  read() {
    return [...this.local.values()].filter((i) => !i.deleted);
  }
  setOnline(online: boolean) {
    this.online = online;
  }
  sync() {
    if (!this.online) return;
    for (const it of this.queue) {
      const remote = this.server.get(it.id);
      this.server.set(it.id, remote ? mergeItems(remote, it) : it);
    }
    this.queue = [];
    for (const [id, remote] of this.server) {
      const mine = this.local.get(id);
      this.local.set(id, mine ? mergeItems(mine, remote) : remote);
    }
  }
  restart() {
    // Survives only if local state is genuinely serializable/persistable.
    this.local = new Map(JSON.parse(JSON.stringify([...this.local.entries()])));
  }

  private upsert(it: StoredItem) {
    const mine = this.local.get(it.id);
    this.local.set(it.id, mine ? mergeItems(mine, it) : it);
    this.queue.push(it);
    if (this.online) this.sync();
  }
}

// ── Harness ──────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}
const t = (n: number) => 1000 + n;

function run() {
  console.log("\n  Offline-sync torture test\n  ─────────────────────────");

  // S1 — offline writes survive reconnect
  {
    const server = new Map<string, StoredItem>();
    const a = new MemoryEngine(server, "A");
    a.setOnline(false);
    for (let i = 0; i < 30; i++) a.add({ id: `s1-${i}`, name: `item ${i}`, quantity: 1 }, t(i));
    a.setOnline(true);
    a.sync();
    assert(a.read().length === 30, "S1 · 30 offline writes survive reconnect");
    assert(server.size === 30, "S1 · all 30 reached the server");
  }

  // S2 — cold restart (app update) loses nothing
  {
    const server = new Map<string, StoredItem>();
    const a = new MemoryEngine(server, "A");
    a.add({ id: "s2", name: "olive oil", quantity: 1 }, t(1));
    a.restart();
    assert(a.read().some((i) => i.id === "s2"), "S2 · item present after cold restart");
  }

  // S3 — concurrent add of the same item accumulates (THE data-loss test)
  {
    const server = new Map<string, StoredItem>();
    const a = new MemoryEngine(server, "A");
    const b = new MemoryEngine(server, "B");
    a.setOnline(false); b.setOnline(false);
    a.add({ id: "milk", name: "milk", quantity: 1 }, t(1));
    b.add({ id: "milk", name: "milk", quantity: 1 }, t(2));
    a.setOnline(true); a.sync();
    b.setOnline(true); b.sync();
    a.sync();
    const milk = a.read().find((i) => i.id === "milk");
    assert(!!milk && quantityOf(milk) === 2, "S3 · concurrent adds sum to 2 (no lost update)");
  }

  // S4 — delete while offline propagates as a tombstone
  {
    const server = new Map<string, StoredItem>();
    const a = new MemoryEngine(server, "A");
    const b = new MemoryEngine(server, "B");
    a.add({ id: "s4", name: "parsley", quantity: 1 }, t(1));
    b.sync(); // B sees parsley
    b.setOnline(false);
    a.del("s4", t(5));
    b.setOnline(true); b.sync();
    assert(!b.read().some((i) => i.id === "s4"), "S4 · offline device honors the remote delete");
  }

  // S5 — 1000 update cycles + periodic restarts, no drift
  {
    const server = new Map<string, StoredItem>();
    const a = new MemoryEngine(server, "A");
    for (let i = 0; i < 1000; i++) {
      a.add({ id: "hot", name: "hot item", quantity: 1 }, t(i));
      if (i % 50 === 0) a.restart();
    }
    const hot = a.read().find((i) => i.id === "hot");
    assert(!!hot, "S5 · item survives 1000 cycles + restarts");
    assert(!!hot && quantityOf(hot) === 1, "S5 · quantity stays 1 (idempotent — no drift)");
  }

  console.log("\n  ─────────────────────────");
  console.log(`  ${passed} passed · ${failed} failed`);
  console.log(failed === 0
    ? "\n  Reference passes. Now write PowerSync + Replicache adapters and run THIS test\n  against each. Least ceremony to pass wins (ADR-003).\n"
    : "\n  ⚠ Reference failed — the conflict policy in syncEngine.ts has a hole.\n");
  process.exit(failed === 0 ? 0 : 1);
}

run();

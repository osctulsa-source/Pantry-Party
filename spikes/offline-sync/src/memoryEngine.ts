/**
 * Phase 0 — offline-sync spike · MemoryEngine
 *
 * Extracted from tortureTest.ts so the torture test can swap engines via env var.
 * Reference implementation — correct by construction, used as the baseline that any
 * real engine (PowerSync, Replicache) must match.
 *
 * THROWAWAY.
 */
import { mergeItems, type ItemInput, type StoredItem, type SyncEngine } from "./syncEngine.ts";

export class MemoryEngine implements SyncEngine {
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
    this.local = new Map(JSON.parse(JSON.stringify([...this.local.entries()])));
  }

  private upsert(it: StoredItem) {
    const mine = this.local.get(it.id);
    this.local.set(it.id, mine ? mergeItems(mine, it) : it);
    this.queue.push(it);
    if (this.online) this.sync();
  }
}

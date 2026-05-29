/**
 * Phase 0 — offline-sync spike · PowerSync adapter (SCAFFOLD)
 *
 * Goal: make this class satisfy `SyncEngine` so the torture test can run against a real
 * PowerSync instance. When all 5 scenarios pass, PowerSync is a viable ADR-003 candidate.
 *
 * ──────────────────────────────────────────────────────────────────────────────────
 *   READ FIRST: ../setup-powersync.md
 *   That has the Supabase + PowerSync cloud setup. This file is useless without it.
 * ──────────────────────────────────────────────────────────────────────────────────
 *
 *   SDK CAVEAT: the `@powersync/node` API names in the TODO comments below
 *   (`db.execute`, `db.connect`, `db.waitForFirstSync`, etc.) reflect the SHAPE of the
 *   PowerSync API, not a freshly verified read of the current README. The SDK is
 *   evolving — open the current `@powersync/node` docs and confirm exact method names
 *   before pasting from these comments. The architecture is right; the surface may have
 *   drifted between releases.
 * ──────────────────────────────────────────────────────────────────────────────────
 *
 * ARCHITECTURE NOTES (and the impedance with our interface)
 *
 *  - PowerSync syncs CONTINUOUSLY when connected. There is no explicit `sync()`. Our
 *    adapter's `sync()` becomes: wait for the local change queue to drain to the server
 *    AND for any pending server changes to apply locally. Use `db.waitForFirstSync()` /
 *    a checkpoint helper, or poll a sync-status property.
 *
 *  - Persistence is real SQLite, on disk. Our `restart()` simulates app update by
 *    closing the database and opening a new instance pointed at the SAME file. State
 *    must survive — that's the whole point of S2.
 *
 *  - The conflict policy moves to Postgres. Each device writes its own row in
 *    `pantry_items` (PRIMARY KEY = id, device_id). Reading merges them client-side
 *    using our existing `mergeItems()` (which already handles per-device qty,
 *    earliest-expires, tombstone-wins, latest-update-wins). DO NOT re-implement
 *    the merge in SQL — keeping it in one place avoids drift.
 *
 *  - `setOnline(false)` calls `db.disconnect()`. PowerSync queues writes locally and
 *    flushes them on reconnect. That's the offline-write story (S1 + S4).
 *
 * THROWAWAY. Delete this directory after ADR-003 is logged.
 */

import { mergeItems, quantityOf, type ItemInput, type StoredItem, type SyncEngine } from "./syncEngine.ts";

// TODO: install + import the real client
//   npm install @powersync/node @powersync/common
// import { PowerSyncDatabase, Schema, Table, column } from "@powersync/node";

/** Schema mirror — keep this in sync with the Postgres table in setup-powersync.md. */
// TODO: define schema using PowerSync's schema builder
// const schema = new Schema([
//   new Table("pantry_items", [
//     column.text("id"),
//     column.text("device_id"),
//     column.text("name"),
//     column.real("qty"),
//     column.text("expires_at"),  // ISO string
//     column.integer("deleted"),   // 0 or 1
//     column.integer("updated_at"),
//   ]),
// ]);

interface RawRow {
  id: string;
  device_id: string;
  name: string;
  qty: number;
  expires_at: string | null;
  deleted: number;
  updated_at: number;
}

export class PowerSyncEngine implements SyncEngine {
  // TODO: declare the PowerSync database
  // private db: PowerSyncDatabase;
  private online = false;

  constructor(private device: string, dbPath = `.powersync/${device}.db`) {
    // TODO: instantiate the db
    //   this.db = new PowerSyncDatabase({ schema, database: { dbFilename: dbPath } });
    //   await this.db.init();
    // Connection happens on setOnline(true).
  }

  add(input: ItemInput, at: number): void {
    // Insert THIS DEVICE'S contribution row. The merge across devices happens on read.
    // TODO:
    //   this.db.execute(
    //     `INSERT INTO pantry_items (id, device_id, name, qty, expires_at, deleted, updated_at)
    //      VALUES (?, ?, ?, ?, ?, 0, ?)
    //      ON CONFLICT (id, device_id) DO UPDATE SET
    //        name = excluded.name,
    //        qty = MAX(qty, excluded.qty),               -- idempotent
    //        expires_at = MIN(expires_at, excluded.expires_at), -- earliest wins
    //        updated_at = MAX(updated_at, excluded.updated_at)`,
    //     [input.id, this.device, input.name, input.quantity, input.expiresAt ?? null, at],
    //   );
  }

  del(id: string, at: number): void {
    // Tombstone: write a row with deleted=1. Read aggregator OR's deleted across devices.
    // TODO:
    //   this.db.execute(
    //     `INSERT INTO pantry_items (id, device_id, name, qty, deleted, updated_at)
    //      VALUES (?, ?, '', 0, 1, ?)
    //      ON CONFLICT (id, device_id) DO UPDATE SET deleted = 1, updated_at = MAX(updated_at, excluded.updated_at)`,
    //     [id, this.device, at],
    //   );
  }

  read(): StoredItem[] {
    // Pull every contribution row, group by id, run our canonical merge.
    // TODO:
    //   const rows = this.db.getAll<RawRow>(`SELECT * FROM pantry_items`);
    //   return this.foldRows(rows);
    return [];
  }

  setOnline(online: boolean): void {
    if (online === this.online) return;
    this.online = online;
    // TODO:
    //   if (online) this.db.connect({ /* connector with PowerSync URL + token */ });
    //   else this.db.disconnect();
  }

  sync(): void {
    // Wait for the local change queue to flush and any pending server changes to apply.
    // PowerSync exposes hooks: db.waitForFirstSync(), syncStatus.hasSynced, etc.
    // TODO:
    //   await this.db.waitForFirstSync(); // or a checkpoint-based wait
  }

  restart(): void {
    // Close and reopen — state on disk must survive (this is the S2 scenario).
    // TODO:
    //   await this.db.close();
    //   this.db = new PowerSyncDatabase({ schema, database: { dbFilename: this.dbPath } });
    //   await this.db.init();
    //   if (this.online) this.db.connect({ /* ... */ });
  }

  /**
   * Group per-device rows by item id, run our existing mergeItems().
   * Filters tombstoned items so `read()` matches the MemoryEngine semantics.
   */
  private foldRows(rows: RawRow[]): StoredItem[] {
    const byId = new Map<string, StoredItem[]>();
    for (const r of rows) {
      const item: StoredItem = {
        id: r.id,
        name: r.name,
        qty: { [r.device_id]: r.qty },
        expiresAt: r.expires_at ?? undefined,
        deleted: r.deleted === 1,
        updatedAt: r.updated_at,
        updatedBy: r.device_id,
      };
      const list = byId.get(r.id) ?? [];
      list.push(item);
      byId.set(r.id, list);
    }
    const out: StoredItem[] = [];
    for (const list of byId.values()) {
      let merged = list[0]!;
      for (let i = 1; i < list.length; i++) merged = mergeItems(merged, list[i]!);
      if (!merged.deleted) out.push(merged);
    }
    return out;
  }
}

// Exported for tests / sanity checks against the merge logic.
export { quantityOf };

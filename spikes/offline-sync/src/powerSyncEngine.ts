/**
 * Phase 0 — offline-sync spike · PowerSync adapter (IMPLEMENTED)
 *
 * Satisfies `SyncEngine` so the torture test can run against a real, self-hosted
 * PowerSync instance (local Docker stack in ../../powersync). When all 5 scenarios
 * pass, PowerSync is a viable ADR-003 candidate.
 *
 *   READ FIRST: ../setup-powersync.md  (Supabase/cloud path) — superseded for this
 *   spike by the SELF-HOSTED Docker stack. Connection details come from .env:
 *     POWERSYNC_URL   = http://localhost:8080
 *     POWERSYNC_TOKEN = dev JWT (HS256, see powersync/service.yaml client_auth)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE (and how it maps onto our interface)
 *
 *  - Each device writes ONLY its own contribution row. PowerSync requires a single
 *    text `id` primary key per table and does NOT support composite keys, so the
 *    client `id` is the synthetic `${itemId}:${deviceId}` (built in the sync rule:
 *    `SELECT id || ':' || device_id AS id, id AS item_id, ...`). The original item
 *    id and device id ride along as columns. Reading groups by `item_id` and folds
 *    via our canonical `mergeItems()` — the merge lives in ONE place, never in SQL.
 *
 *  - PowerSync only DOWNLOADS (Postgres → SQLite via logical replication). The
 *    UPLOAD (SQLite → Postgres) is the connector's job: `uploadData()` drains the
 *    local CRUD queue and writes to Postgres with INSERT … ON CONFLICT (id,
 *    device_id) DO UPDATE using GREATEST/LEAST — the idempotent SQL twin of
 *    `mergeItems` (max qty, earliest expiry, tombstone-wins, latest update).
 *
 *  - `sync()` waits for the upload queue to drain (which guarantees the Postgres
 *    commit) and then for a download cycle to complete (lastSyncedAt advancing).
 *    That two-phase wait is what makes the cross-device scenario (S3) deterministic.
 *
 *  - PowerSync's local tables are JSON-backed SQLite VIEWS, which don't support
 *    `INSERT … ON CONFLICT`. So local upserts are read-then-INSERT/UPDATE.
 *
 *  - `restart()` closes the DB and reopens the SAME file — on-disk SQLite (data +
 *    pending CRUD queue) must survive. That's the whole point of S2/S5.
 *
 * THROWAWAY. Delete this directory after ADR-003 is logged.
 */

import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import pg from "pg";
import {
  PowerSyncDatabase,
  Schema,
  Table,
  column,
  UpdateType,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from "@powersync/node";
import { mergeItems, quantityOf, type ItemInput, type StoredItem, type SyncEngine } from "./syncEngine.ts";

/** Client-side schema mirror. `id` (the synthetic `${itemId}:${deviceId}`) is the
 *  implicit PowerSync primary key; everything else is an explicit column. */
const schema = new Schema({
  pantry_items: new Table({
    item_id: column.text,
    device_id: column.text,
    name: column.text,
    qty: column.real,
    expires_at: column.text,
    deleted: column.integer,
    updated_at: column.integer,
  }),
});

interface RawRow {
  id: string;
  item_id: string;
  device_id: string;
  name: string;
  qty: number;
  expires_at: string | null;
  deleted: number;
  updated_at: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ISO-string earliest-wins, null = "no expiry" (loses to any real date). */
function earliestStr(x: string | null, y: string | null): string | null {
  if (!x) return y;
  if (!y) return x;
  return new Date(x) <= new Date(y) ? x : y;
}

// ── Backend (Postgres) connection — shared across all engines ────────────────────
// The self-hosted source DB (pg-db) is published on localhost:5432 by the Docker
// stack. uploadData writes here; PowerSync replicates it back down to every client.
const PG_URL =
  process.env.POWERSYNC_PG_URL ?? "postgresql://postgres:changeme@localhost:5432/postgres";
let pool: pg.Pool | undefined;
function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: PG_URL, max: 4 });
  return pool;
}

/** The connector: how a client authenticates, and how local writes reach Postgres. */
function makeConnector(): PowerSyncBackendConnector {
  return {
    fetchCredentials: async (): Promise<PowerSyncCredentials | null> => {
      const endpoint = process.env.POWERSYNC_URL;
      const token = process.env.POWERSYNC_TOKEN;
      if (!endpoint || !token) {
        throw new Error("POWERSYNC_URL / POWERSYNC_TOKEN missing — is .env loaded? (npm run test:powersync)");
      }
      return { endpoint, token };
    },

    uploadData: async (database: AbstractPowerSyncDatabase): Promise<void> => {
      let tx = await database.getNextCrudTransaction();
      while (tx) {
        const client = await getPool().connect();
        try {
          await client.query("BEGIN");
          for (const op of tx.crud) {
            if (op.table !== "pantry_items") continue;
            // item_id/device_id are derived from the synthetic id so this works even
            // for PATCH ops (whose opData only carries changed columns).
            const sep = op.id.lastIndexOf(":");
            const itemId = op.id.slice(0, sep);
            const deviceId = op.id.slice(sep + 1);
            const d = op.opData ?? {};

            if (op.op === UpdateType.DELETE) {
              // We model deletes as tombstones (deleted=1), not row removal, but
              // honor a hard DELETE defensively.
              await client.query(
                `UPDATE pantry_items SET deleted = 1 WHERE id = $1 AND device_id = $2`,
                [itemId, deviceId],
              );
              continue;
            }

            // PUT (insert/replace) or PATCH (partial). COALESCE preserves existing
            // values when a PATCH omits a column; GREATEST/LEAST = idempotent merge.
            await client.query(
              `INSERT INTO pantry_items (id, device_id, name, qty, expires_at, deleted, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (id, device_id) DO UPDATE SET
                 name       = COALESCE(EXCLUDED.name, pantry_items.name),
                 qty        = GREATEST(pantry_items.qty, COALESCE(EXCLUDED.qty, pantry_items.qty)),
                 expires_at = LEAST(pantry_items.expires_at, EXCLUDED.expires_at),
                 deleted    = GREATEST(pantry_items.deleted, COALESCE(EXCLUDED.deleted, pantry_items.deleted)),
                 updated_at = GREATEST(pantry_items.updated_at, COALESCE(EXCLUDED.updated_at, pantry_items.updated_at))`,
              [
                itemId,
                deviceId,
                d.name ?? "",
                d.qty ?? 0,
                d.expires_at ?? null,
                d.deleted ?? 0,
                d.updated_at ?? 0,
              ],
            );
          }
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          client.release();
          throw err; // PowerSync retries after the configured delay
        }
        client.release();
        await tx.complete();
        tx = await database.getNextCrudTransaction();
      }
    },
  };
}

/**
 * The torture test creates a fresh engine per scenario via `newEngine(device)` but
 * never disposes the old one. Two PowerSyncDatabase instances on the SAME SQLite file
 * deadlock on locks, so we keep one live engine per device and dispose the previous
 * before opening the next. (MemoryEngine is in-memory so it doesn't hit this.)
 */
const liveByDevice = new Map<string, PowerSyncEngine>();

export class PowerSyncEngine implements SyncEngine {
  private db!: PowerSyncDatabase;
  private readonly connector = makeConnector();
  private readonly ready: Promise<void>;
  private online = true; // mirror MemoryEngine's default (connected)
  private connected = false;

  constructor(private device: string, private dbPath = `.powersync/${device}.db`) {
    this.ready = this.boot();
  }

  private async boot(): Promise<void> {
    const prev = liveByDevice.get(this.device);
    if (prev && prev !== this) await prev.dispose();
    liveByDevice.set(this.device, this);
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new PowerSyncDatabase({ schema, database: { dbFilename: this.dbPath } });
    await this.db.init();
    if (this.online) await this.ensureConnected();
  }

  /** Disconnect and close — releases the SQLite file so the next instance can open it. */
  private async dispose(): Promise<void> {
    await this.ready.catch(() => {});
    await this.disconnectInner();
    await this.db.close();
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    await this.db.connect(this.connector);
    this.connected = true;
  }

  private async disconnectInner(): Promise<void> {
    if (!this.connected) return;
    await this.db.disconnect();
    this.connected = false;
  }

  async add(input: ItemInput, at: number): Promise<void> {
    await this.ready;
    const rowId = `${input.id}:${this.device}`;
    const existing = await this.db.getOptional<RawRow>(
      `SELECT qty, expires_at, updated_at FROM pantry_items WHERE id = ?`,
      [rowId],
    );
    if (!existing) {
      await this.db.execute(
        `INSERT INTO pantry_items (id, item_id, device_id, name, qty, expires_at, deleted, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [rowId, input.id, this.device, input.name, input.quantity, input.expiresAt ?? null, at],
      );
    } else {
      // Idempotent per-device merge: max qty, earliest expiry, latest clock.
      const qty = Math.max(existing.qty, input.quantity);
      const expires = earliestStr(existing.expires_at, input.expiresAt ?? null);
      const updated = Math.max(existing.updated_at, at);
      await this.db.execute(
        `UPDATE pantry_items SET item_id = ?, device_id = ?, name = ?, qty = ?, expires_at = ?, updated_at = ? WHERE id = ?`,
        [input.id, this.device, input.name, qty, expires, updated, rowId],
      );
    }
  }

  async del(id: string, at: number): Promise<void> {
    await this.ready;
    const rowId = `${id}:${this.device}`;
    const existing = await this.db.getOptional<RawRow>(
      `SELECT updated_at FROM pantry_items WHERE id = ?`,
      [rowId],
    );
    if (!existing) {
      await this.db.execute(
        `INSERT INTO pantry_items (id, item_id, device_id, name, qty, expires_at, deleted, updated_at)
         VALUES (?, ?, ?, '', 0, NULL, 1, ?)`,
        [rowId, id, this.device, at],
      );
    } else {
      await this.db.execute(
        `UPDATE pantry_items SET deleted = 1, updated_at = ? WHERE id = ?`,
        [Math.max(existing.updated_at, at), rowId],
      );
    }
    // Deletes are rare; flush the tombstone to Postgres now so a peer's next sync()
    // deterministically observes it (S4). add() stays non-blocking for S5's volume.
    if (this.connected) await this.waitUploadsDrained();
  }

  async read(): Promise<StoredItem[]> {
    await this.ready;
    const rows = await this.db.getAll<RawRow>(
      `SELECT id, item_id, device_id, name, qty, expires_at, deleted, updated_at FROM pantry_items`,
    );
    return this.foldRows(rows);
  }

  async setOnline(online: boolean): Promise<void> {
    await this.ready;
    if (online === this.online) return;
    this.online = online;
    if (online) await this.ensureConnected();
    else await this.disconnectInner();
  }

  async sync(): Promise<void> {
    await this.ready;
    if (!this.online) return; // matches MemoryEngine: no-op while offline
    await this.ensureConnected();
    await this.waitUploadsDrained(); // own writes committed to Postgres
    await this.waitDownloadConsistent(); // remote changes pulled + applied locally
  }

  async restart(): Promise<void> {
    await this.ready;
    await this.disconnectInner();
    await this.db.close();
    // Reopen the SAME file — on-disk state (rows + pending CRUD) must survive.
    this.db = new PowerSyncDatabase({ schema, database: { dbFilename: this.dbPath } });
    await this.db.init();
    if (this.online) await this.ensureConnected();
  }

  // ── sync waits ────────────────────────────────────────────────────────────────
  private async waitUploadsDrained(timeoutMs = 20_000): Promise<void> {
    const start = Date.now();
    for (;;) {
      const stats = await this.db.getUploadQueueStats(false);
      const uploading = this.db.currentStatus?.dataFlowStatus?.uploading ?? false;
      if ((stats?.count ?? 0) === 0 && !uploading) return;
      if (Date.now() - start > timeoutMs) {
        throw new Error(`PowerSync upload-drain timeout (pending=${stats?.count})`);
      }
      await sleep(20);
    }
  }

  /**
   * Wait until the local SQLite view has caught up with Postgres.
   *
   * PowerSync's `lastSyncedAt` only advances on new data and has 1-second precision,
   * so it can't reliably answer "am I caught up *now*?". Instead we compare the local
   * row state against the source of truth (Postgres): the global stream syncs every
   * row, so when local row count and max(updated_at) reach Postgres's, every insert
   * AND update (including tombstones) has downloaded. This is fully deterministic.
   */
  private async waitDownloadConsistent(timeoutMs = 30_000): Promise<void> {
    const start = Date.now();
    for (;;) {
      const pgAgg = await getPool().query<{ c: number; m: string }>(
        "SELECT COUNT(*)::int AS c, COALESCE(MAX(updated_at), 0)::bigint AS m FROM pantry_items",
      );
      const pgCount = Number(pgAgg.rows[0]?.c ?? 0);
      const pgMax = Number(pgAgg.rows[0]?.m ?? 0);
      const local = await this.db.get<{ c: number; m: number }>(
        "SELECT COUNT(*) AS c, COALESCE(MAX(updated_at), 0) AS m FROM pantry_items",
      );
      if (local.c >= pgCount && local.m >= pgMax) return;
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `PowerSync download-consistency timeout (local c=${local.c} m=${local.m} vs pg c=${pgCount} m=${pgMax})`,
        );
      }
      await sleep(40);
    }
  }

  /**
   * Group per-device rows by item id, run our existing mergeItems().
   * Filters tombstoned items so `read()` matches the MemoryEngine semantics.
   */
  private foldRows(rows: RawRow[]): StoredItem[] {
    const byItem = new Map<string, StoredItem[]>();
    for (const r of rows) {
      const item: StoredItem = {
        id: r.item_id,
        name: r.name,
        qty: { [r.device_id]: r.qty },
        expiresAt: r.expires_at ?? undefined,
        deleted: r.deleted === 1,
        updatedAt: r.updated_at,
        updatedBy: r.device_id,
      };
      const list = byItem.get(r.item_id) ?? [];
      list.push(item);
      byItem.set(r.item_id, list);
    }
    const out: StoredItem[] = [];
    for (const list of byItem.values()) {
      let merged = list[0]!;
      for (let i = 1; i < list.length; i++) merged = mergeItems(merged, list[i]!);
      if (!merged.deleted) out.push(merged);
    }
    return out;
  }
}

// Exported for tests / sanity checks against the merge logic.
export { quantityOf };

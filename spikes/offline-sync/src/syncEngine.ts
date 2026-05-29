/**
 * Phase 0 — Offline-sync spike · The interface + the merge model
 *
 * The torture test runs against this. To evaluate a real engine, write a thin adapter
 * (PowerSyncEngine / ReplicacheEngine) that satisfies SyncEngine, then point the SAME
 * torture test at it. Same test, two engines, evidence-based decision (ADR-003).
 *
 * THROWAWAY.
 *
 * ── Why quantity is a per-device map, not a number ──────────────────────────────
 * The naive instinct ("sum quantities on merge") is WRONG: merges must be idempotent,
 * and re-syncing the same write would double the count. We model each device's
 * contribution separately (a G-counter) and merge by MAX per device. Concurrent adds
 * from two devices accumulate; re-merging the same state is a no-op. This is the single
 * subtlest correctness point in the whole app — get it wrong and you get KitchenPal's bug.
 */

export interface ItemInput {
  id: string;
  name: string;
  quantity: number;
  expiresAt?: string; // ISO date
}

export interface StoredItem {
  id: string;
  name: string;
  qty: Record<string, number>; // deviceId -> that device's contribution
  expiresAt?: string;
  deleted?: boolean; // tombstone
  updatedAt: number; // logical clock / epoch ms
  updatedBy: string; // device id
}

export interface SyncEngine {
  /** Local-first add/update. Persists immediately, online or not. `at` = logical clock. */
  add(input: ItemInput, at: number): void;
  /** Tombstone delete. Propagates on reconnect. */
  del(id: string, at: number): void;
  /** Current local view (tombstones excluded). */
  read(): StoredItem[];
  setOnline(online: boolean): void;
  /** Push queued local changes + pull remote. No-op while offline. */
  sync(): void;
  /** App-update cycle: serialize local state, drop it, restore. Surfaces persistence bugs. */
  restart(): void;
}

export const quantityOf = (it: StoredItem): number =>
  Object.values(it.qty).reduce((s, n) => s + n, 0);

const earliest = (x?: string, y?: string): string | undefined =>
  !x ? y : !y ? x : new Date(x) <= new Date(y) ? x : y;

/** Max per device — idempotent, commutative, associative. */
function mergeQty(x: Record<string, number>, y: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...x };
  for (const d of Object.keys(y)) out[d] = Math.max(out[d] ?? 0, y[d]!);
  return out;
}

/**
 * Conflict policy (mirrors docs/ARCHITECTURE.md):
 *  - deletion → tombstone wins, dated by the later updatedAt
 *  - quantity → max per device (concurrent adds accumulate, re-sync is a no-op)
 *  - expiresAt → earliest wins (safer)
 *  - other fields → last-write-wins by updatedAt
 */
export function mergeItems(a: StoredItem, b: StoredItem): StoredItem {
  if (a.deleted || b.deleted) {
    const later = a.updatedAt >= b.updatedAt ? a : b;
    return { ...later, deleted: true, qty: mergeQty(a.qty, b.qty) };
  }
  const base = a.updatedAt >= b.updatedAt ? a : b;
  return { ...base, qty: mergeQty(a.qty, b.qty), expiresAt: earliest(a.expiresAt, b.expiresAt) };
}

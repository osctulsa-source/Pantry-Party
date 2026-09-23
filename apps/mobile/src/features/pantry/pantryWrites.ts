/**
 * Every UPDATE to an existing pantry_items row goes through here. Inserts live
 * in addPantryItem.ts. Keeping the write shapes in one place means a change to
 * conflict semantics (ADR-011 per-device quantity, ADR-012 per-field stamps)
 * is a change to this file, not a hunt across screens.
 *
 * Each helper takes an optional executor so it composes inside a caller's
 * `db.writeTransaction(async (tx) => …)`; omitted, it writes straight to the
 * local PowerSync database. Every write stamps `updated_at` (epoch ms — the
 * bigint merge clock, NOT a display timestamp) and becomes a PATCH carrying
 * only the columns it SETs.
 *
 * Quantity is last-writer-to-sync-wins today (ADR-012): both
 * setPantryQuantity and incrementPantryQuantity upload an ABSOLUTE value, so
 * concurrent changes on two devices do not add up. Don't build UX that
 * promises they do until ADR-011 lands.
 */
import type { StorageLocation } from '@breadbox/core';

import { getPowerSync } from '../../data/powersync/db';

/** The slice of PowerSync's db / transaction API these writes need. */
export interface SqlExecutor {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

function executor(exec?: SqlExecutor): SqlExecutor {
  return exec ?? getPowerSync();
}

/** Tombstone items (delete, "used", "use it all"). Sync propagates `deleted`. */
export async function tombstonePantryItems(
  ids: readonly string[],
  exec?: SqlExecutor,
  now: number = Date.now(),
): Promise<void> {
  const db = executor(exec);
  for (const id of ids) {
    await db.execute('UPDATE pantry_items SET deleted = 1, updated_at = ? WHERE id = ?', [now, id]);
  }
}

/** Reverse a tombstone (undo). */
export async function restorePantryItems(
  ids: readonly string[],
  exec?: SqlExecutor,
  now: number = Date.now(),
): Promise<void> {
  const db = executor(exec);
  for (const id of ids) {
    await db.execute('UPDATE pantry_items SET deleted = 0, updated_at = ? WHERE id = ?', [now, id]);
  }
}

export async function setPantryFillLevel(
  id: string,
  fillLevel: number,
  exec?: SqlExecutor,
  now: number = Date.now(),
): Promise<void> {
  await executor(exec).execute('UPDATE pantry_items SET fill_level = ?, updated_at = ? WHERE id = ?', [
    fillLevel,
    now,
    id,
  ]);
}

export async function setPantryExpiry(
  id: string,
  expiresIso: string | null,
  exec?: SqlExecutor,
  now: number = Date.now(),
): Promise<void> {
  await executor(exec).execute('UPDATE pantry_items SET expires_at = ?, updated_at = ? WHERE id = ?', [
    expiresIso,
    now,
    id,
  ]);
}

export async function setPantryExpiryAndLocation(
  id: string,
  expiresIso: string | null,
  location: StorageLocation,
  exec?: SqlExecutor,
  now: number = Date.now(),
): Promise<void> {
  await executor(exec).execute(
    'UPDATE pantry_items SET expires_at = ?, location = ?, updated_at = ? WHERE id = ?',
    [expiresIso, location, now, id],
  );
}

/** Set an absolute quantity (e.g. cooking decrements). LWW — see file header. */
export async function setPantryQuantity(
  id: string,
  quantity: number,
  exec?: SqlExecutor,
  now: number = Date.now(),
): Promise<void> {
  await executor(exec).execute('UPDATE pantry_items SET quantity = ?, updated_at = ? WHERE id = ?', [
    quantity,
    now,
    id,
  ]);
}

/**
 * Add to the LOCAL quantity (capture merges). The sum happens in local SQLite;
 * what uploads is the resulting absolute value — LWW, not an additive op.
 */
export async function incrementPantryQuantity(
  id: string,
  by: number,
  exec?: SqlExecutor,
  now: number = Date.now(),
): Promise<void> {
  await executor(exec).execute(
    'UPDATE pantry_items SET quantity = quantity + ?, updated_at = ? WHERE id = ?',
    [by, now, id],
  );
}

export interface PantryItemEdit {
  name: string;
  brand: string | null;
  quantity: number;
  unit: string | null;
  fillLevel: number | null;
  location: StorageLocation;
  expiresIso: string | null;
}

/** The Edit Item form's save. PowerSync uploads only the columns that changed. */
export async function applyPantryItemEdit(
  id: string,
  edit: PantryItemEdit,
  exec?: SqlExecutor,
  now: number = Date.now(),
): Promise<void> {
  await executor(exec).execute(
    `UPDATE pantry_items
        SET name = ?, brand = ?, quantity = ?, unit = ?, fill_level = ?, location = ?, expires_at = ?, updated_at = ?
      WHERE id = ?`,
    [
      edit.name,
      edit.brand,
      edit.quantity,
      edit.unit,
      edit.fillLevel,
      edit.location,
      edit.expiresIso,
      now,
      id,
    ],
  );
}

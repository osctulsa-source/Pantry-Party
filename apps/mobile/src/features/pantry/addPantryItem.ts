/**
 * Shared insert for pantry items — used by the manual Add form and the
 * one-tap quick-add staples. Writes to PowerSync's local SQLite; the CRUD queue
 * + uploadData() drain it to the upload-proxy → Postgres (offline-first, PR #9).
 *
 * Centralized so the INSERT shape (column order, sync bookkeeping) lives in one
 * place — both callers stay in lockstep.
 *
 * Category is taken from an explicit caller override when provided (quick-add
 * staples), otherwise inferred from the name (categorizeByName) so the Pantry
 * row shows a real CategoryIcon instead of the fallback basket. It's
 * persisted (the upload-proxy's pantry_items INSERT allowlist includes
 * `category`, so it syncs); null when nothing matches. Legacy / mis-tagged
 * rows get re-inferred at read time (see rowToPantryItem / getPantryZone).
 */
import * as Crypto from 'expo-crypto';
import { categorizeByName, type CaptureSource, type StorageLocation } from '@breadbox/core';

import { getPowerSync } from '../../data/powersync/db';

export interface NewPantryItem {
  householdId: string;
  userId: string;
  name: string;
  /** Optional brand (e.g. "Horizon"). null when unspecified. */
  brand?: string | null;
  /** Retail UPC/EAN when the item came from a barcode scan — enables re-scan memory. */
  barcode?: string | null;
  quantity: number;
  /** Canonical UNITS value or null for unitless counts (UnitPicker). */
  unit?: string | null;
  /**
   * Explicit category when the caller already knows it (quick-add staples).
   * Wins over name inference so curated chips stay in the right browse zone.
   */
  category?: string | null;
  location: StorageLocation;
  expiresIso: string | null;
  source?: CaptureSource;
}

export async function addPantryItem(input: NewPantryItem): Promise<void> {
  const db = getPowerSync();
  await db.execute(
    `INSERT INTO pantry_items
       (id, household_id, name, category, brand, barcode, quantity, unit, location, expires_at, added_at, source, added_by, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Crypto.randomUUID(),
      input.householdId,
      input.name,
      input.category ?? categorizeByName(input.name) ?? null,
      input.brand ?? null,
      input.barcode ?? null,
      input.quantity,
      input.unit ?? null,
      input.location,
      input.expiresIso,
      new Date().toISOString(),
      input.source ?? 'manual',
      input.userId,
      Date.now(), // epoch ms — bigint merge clock, NOT a timestamp
      0, // deleted=0 so the row passes PantryScreen's `WHERE deleted = 0`
    ],
  );
}

/**
 * Insert — or, when an IDENTICAL row already exists, bump its quantity
 * instead. "Identical" mirrors core's itemMergeKey (name/brand/unit/location/
 * exact expiry), so this can never hide a sooner-expiring duplicate behind a
 * later one; the failure mode is under-merging, same as the display grouping.
 *
 * Used by the capture flows: scanning the same product twice in one stock-take
 * used to create twin rows ("Eggs ×1", "Eggs ×1") that the user then had to
 * clean up. Returns what happened so callers can phrase their feedback.
 */
export async function addOrMergePantryItem(input: NewPantryItem): Promise<'inserted' | 'merged'> {
  const db = getPowerSync();
  const rows = await db.getAll<{ id: string }>(
    `SELECT id FROM pantry_items
      WHERE deleted = 0 AND household_id = ?
        AND lower(trim(name)) = lower(trim(?))
        AND lower(trim(coalesce(brand, ''))) = lower(trim(?))
        AND lower(trim(coalesce(unit, ''))) = lower(trim(?))
        AND lower(trim(location)) = lower(trim(?))
        AND coalesce(expires_at, '') = ?
      LIMIT 1`,
    [
      input.householdId,
      input.name,
      input.brand ?? '',
      input.unit ?? '',
      input.location,
      input.expiresIso ?? '',
    ],
  );
  const existing = rows[0];
  if (existing) {
    await db.execute(
      'UPDATE pantry_items SET quantity = quantity + ?, updated_at = ? WHERE id = ?',
      [input.quantity, Date.now(), existing.id],
    );
    return 'merged';
  }
  await addPantryItem(input);
  return 'inserted';
}

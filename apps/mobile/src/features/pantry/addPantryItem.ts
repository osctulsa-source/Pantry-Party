/**
 * Shared insert for pantry items — used by the manual Add form and the
 * one-tap quick-add staples. Writes to PowerSync's local SQLite; the CRUD queue
 * + uploadData() drain it to the upload-proxy → Postgres (offline-first, PR #9).
 *
 * Centralized so the INSERT shape (column order, sync bookkeeping) lives in one
 * place — both callers stay in lockstep.
 */
import * as Crypto from 'expo-crypto';
import type { CaptureSource, StorageLocation } from '@breadbox/core';

import { getPowerSync } from '../../data/powersync/db';

export interface NewPantryItem {
  householdId: string;
  userId: string;
  name: string;
  /** Optional brand (e.g. "Horizon"). null when unspecified. */
  brand?: string | null;
  quantity: number;
  /** Canonical UNITS value or null for unitless counts (UnitPicker). */
  unit?: string | null;
  location: StorageLocation;
  expiresIso: string | null;
  source?: CaptureSource;
}

export async function addPantryItem(input: NewPantryItem): Promise<void> {
  const db = getPowerSync();
  await db.execute(
    `INSERT INTO pantry_items
       (id, household_id, name, brand, quantity, unit, location, expires_at, added_at, source, added_by, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Crypto.randomUUID(),
      input.householdId,
      input.name,
      input.brand ?? null,
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

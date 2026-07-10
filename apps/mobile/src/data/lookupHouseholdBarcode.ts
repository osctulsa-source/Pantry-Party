/**
 * Household barcode memory — look up a prior correction for this UPC.
 *
 * When a user renames an OFF miss (or wrong hit) and adds it, we persist the
 * barcode on the pantry row. Re-scanning the same code prefers that household
 * name/brand over Open Food Facts so corrections stick across devices (PowerSync).
 *
 * Includes tombstoned rows: a used-up item still teaches the next scan.
 */
import { getPowerSync } from './powersync/db';
import { isRetailBarcode } from './retailBarcode';

export interface HouseholdBarcodeHit {
  name: string;
  brand: string | null;
}

export async function lookupHouseholdBarcode(
  householdId: string,
  barcode: string,
): Promise<HouseholdBarcodeHit | null> {
  const code = barcode.trim();
  if (!householdId || !isRetailBarcode(code)) return null;

  const rows = await getPowerSync().getAll<{ name: string; brand: string | null }>(
    `SELECT name, brand FROM pantry_items
     WHERE household_id = ? AND barcode = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    [householdId, code],
  );
  const row = rows[0];
  if (!row?.name?.trim()) return null;
  return { name: row.name.trim(), brand: row.brand?.trim() || null };
}

export { isRetailBarcode } from './retailBarcode';

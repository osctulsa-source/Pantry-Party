/**
 * Stub pantry — in-memory hardcoded data for the walking skeleton.
 *
 * The whole point of this file existing as a repository abstraction is that swapping
 * to a PowerSync-backed implementation later is a one-file change: implement the same
 * `PantryRepository` interface against the real local SQLite store. The screen never
 * knows where the data came from.
 *
 * Every item below is validated via `parsePantryItem` so we prove the @breadbox/core
 * schema integration works at runtime, not just at the type level.
 */
import { PantryItem, parsePantryItem } from '@breadbox/core';

export interface PantryRepository {
  list(): Promise<PantryItem[]>;
}

const HOUSEHOLD_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_ID = 'stub-device';

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// Raw inputs — kept honest about the zod-required shape. Each one round-trips through
// parsePantryItem so any schema drift in @breadbox/core surfaces here immediately.
const RAW_ITEMS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    householdId: HOUSEHOLD_ID,
    name: 'Chicken breast',
    brand: 'Organic Valley',
    category: 'meat',
    quantity: 1,
    unit: 'lb',
    location: 'fridge',
    addedAt: daysFromNow(-2),
    expiresAt: daysFromNow(2),
    source: 'receipt',
    addedBy: DEVICE_ID,
    updatedAt: Date.now() - 86_400_000,
    deleted: false,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    householdId: HOUSEHOLD_ID,
    name: 'Olive oil',
    category: 'pantry',
    quantity: 1,
    unit: 'bottle',
    location: 'pantry',
    addedAt: daysFromNow(-30),
    expiresAt: daysFromNow(120),
    source: 'manual',
    addedBy: DEVICE_ID,
    updatedAt: Date.now() - 30 * 86_400_000,
    deleted: false,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    householdId: HOUSEHOLD_ID,
    name: 'Parsley',
    category: 'produce',
    quantity: 1,
    unit: 'bunch',
    location: 'fridge',
    addedAt: daysFromNow(-1),
    expiresAt: daysFromNow(4),
    source: 'receipt',
    addedBy: DEVICE_ID,
    updatedAt: Date.now() - 86_400_000,
    deleted: false,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    householdId: HOUSEHOLD_ID,
    name: 'Eggs',
    brand: 'Vital Farms',
    category: 'dairy',
    quantity: 12,
    unit: 'ct',
    location: 'fridge',
    addedAt: daysFromNow(-5),
    expiresAt: daysFromNow(18),
    source: 'barcode',
    addedBy: DEVICE_ID,
    updatedAt: Date.now() - 5 * 86_400_000,
    deleted: false,
  },
];

const ITEMS: readonly PantryItem[] = RAW_ITEMS.map(parsePantryItem);

export const stubPantry: PantryRepository = {
  async list() {
    return [...ITEMS];
  },
};

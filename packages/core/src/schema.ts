/**
 * The canonical pantry-item schema (ADR-004).
 *
 * Capture (barcode/OCR/manual), sync, recipes, and shopping ALL read and write this one
 * shape. Defined in @breadbox/core so there is exactly one source of truth. Both Phase 0
 * spikes and the production app import from here.
 *
 * Uses zod so the same definition gives us a TS type AND runtime validation at the
 * capture boundary (OCR output and barcode lookups are untrusted — validate them).
 */

import { z } from "zod";

/** Built-in storage locations — suggestions that seed the picker. The freezer is a
 *  first-class peer of pantry and fridge (under-served by competitors). */
export const DEFAULT_LOCATIONS = ["pantry", "fridge", "freezer"] as const;

/** Where the item physically lives. Any non-empty label up to 40 chars: the built-ins
 *  above are the defaults, and users can create their own (e.g. "Garage", "Spice rack"). */
export const StorageLocation = z.string().min(1).max(40);
export type StorageLocation = z.infer<typeof StorageLocation>;

/** How the item got into the pantry — useful for analytics on capture-mode success. */
export const CaptureSource = z.enum(["barcode", "receipt", "manual", "restock"]);
export type CaptureSource = z.infer<typeof CaptureSource>;

/**
 * Canonical quantity units offered by the UnitPicker (July 2026 quick-strike).
 * New writes come from this list (or null for unitless counts); the `unit`
 * column itself stays free-text-tolerant so legacy rows and future
 * OCR-extracted units ("gal", "fl oz") never fail validation. Unit-aware math
 * (recipe scaling, precise cook decrements) builds on this list later.
 */
export const UNITS = ["ct", "oz", "lb", "g", "kg", "ml", "L", "cup", "tbsp", "tsp"] as const;
export type Unit = (typeof UNITS)[number];

export const PantryItem = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),

  name: z.string().min(1).max(120),
  brand: z.string().max(120).optional(),
  category: z.string().max(80).optional(),
  barcode: z.string().max(20).optional(),

  quantity: z.number().nonnegative().default(1),
  unit: z.string().max(20).optional(), // picker-constrained on write (UNITS); column tolerates legacy free text

  location: StorageLocation.default("pantry"),
  addedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),

  source: CaptureSource,
  addedBy: z.string(), // device or user id — drives "added by Sam" attribution

  // Sync bookkeeping. The engine owns these; features should not hand-edit them.
  updatedAt: z.number().int(),
  deleted: z.boolean().default(false),
});
export type PantryItem = z.infer<typeof PantryItem>;

/** Validate untrusted capture output before it enters the local store. Throws on bad shape. */
export function parsePantryItem(input: unknown): PantryItem {
  return PantryItem.parse(input);
}

/** Days until expiry (negative = already expired). Drives the Cook This urgency ranking. */
export function daysUntilExpiry(item: Pick<PantryItem, "expiresAt">, now = new Date()): number | null {
  if (!item.expiresAt) return null;
  const ms = new Date(item.expiresAt).getTime() - now.getTime();
  return Math.floor(ms / 86_400_000);
}

/** Category → default shelf life (days). Seed for expiration auto-fill; tune from real data. */
export const DEFAULT_SHELF_LIFE: Record<string, number> = {
  produce: 5,
  dairy: 10,
  meat: 3,
  frozen: 180,
  pantry: 365,
  bakery: 5,
  beverage: 90,
};

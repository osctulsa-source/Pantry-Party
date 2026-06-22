/**
 * ActivityEvent — one entry in a household's append-only activity log
 * (History feature). Synced + household-shared, durable across reinstalls;
 * graduates the capped on-device cookLog (100) + expiryEvents (200).
 *
 * `kind` is the discriminator that powers the History screen's filters and the
 * streak / savings math (streakStats.computeInsights):
 *   cooked    — a recipe was cooked ("I made this"); refId = recipe id,
 *               label = recipe title, quantity = items used
 *   used      — a soon/expired item was used in time (rescue); label = item name
 *   tossed    — an item was thrown out (waste); label = item name
 *   expired   — an item lapsed (informational)
 *   restocked — a consumed item was re-added from the shopping list
 *
 * `kind` is stored as plain TEXT in Postgres with NO CHECK constraint, and is
 * lenient (z.string()) at this read boundary ON PURPOSE: a DB CHECK the client
 * can violate is the silent-sync-jam class migration 0002 fixed for `location`,
 * and an over-strict reader would throw on a row written by a newer client.
 * ACTIVITY_KINDS is the canonical known set (writers type against ActivityKind);
 * unknown kinds round-trip harmlessly and the UI buckets them generically.
 *
 * Events are immutable; the only mutation is `deleted` (tombstone) so a user
 * can remove a history row. `meta` is optional JSON for kind-specific extras,
 * so future per-event detail needs no migration.
 */

import { z } from "zod";

export const ACTIVITY_KINDS = [
  "cooked",
  "used",
  "tossed",
  "expired",
  "restocked",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Narrowing guard for the known set (the UI uses it to pick icon/label). */
export function isActivityKind(kind: string): kind is ActivityKind {
  return (ACTIVITY_KINDS as readonly string[]).includes(kind);
}

export const ActivityEvent = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),

  // Lenient — see the module note. ACTIVITY_KINDS is the known set.
  kind: z.string().min(1),

  // Referenced entity: a pantry_item id (used/tossed/expired/restocked) or a
  // recipe id as a string (cooked). Opaque text to hold either.
  refId: z.string().optional(),

  // Human-readable label for display without a join (item name / recipe title).
  label: z.string().min(1).max(300),

  // Optional magnitude — items used for a cook, quantity for a used/tossed item.
  quantity: z.number().optional(),
  unit: z.string().max(20).optional(),

  // Optional image (recipe thumbnail for cooked rows).
  image: z.string().optional(),

  // Optional kind-specific JSON extras (opaque) — avoids a migration for future
  // per-kind detail.
  meta: z.string().optional(),

  // When the event actually happened (display + sort + streak day-bucketing).
  occurredAt: z.string().datetime(),

  addedBy: z.string(),

  // Sync bookkeeping — engine-owned, mirrors PantryItem.
  updatedAt: z.number().int(),
  deleted: z.boolean().default(false),
});
export type ActivityEvent = z.infer<typeof ActivityEvent>;

/** Validate a row at the read boundary. Throws on bad shape. */
export function parseActivityEvent(input: unknown): ActivityEvent {
  return ActivityEvent.parse(input);
}

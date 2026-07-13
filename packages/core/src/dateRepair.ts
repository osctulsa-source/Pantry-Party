/**
 * dateRepair — one-time repair proposals for auto-filled expiry dates (pure).
 *
 * Until July 2026 the capture flows stored every item as location "pantry" and
 * estimated expiry with a location-less (fridge-first) lookup — so milk got the
 * 91-day freezer number, canned tomatoes the fresh-produce one, etc. The add
 * flows are fixed, but existing rows keep their poisoned dates and quietly
 * skew everything ranked by expiry.
 *
 * This module re-runs today's inference over existing items and proposes
 * corrections. The schema has no "was this date auto-filled?" flag, so it
 * proposes for ANY item whose stored location/expiry disagree with the current
 * inference by enough to matter — the user reviews and applies per item.
 *
 * Anchoring: the fresh estimate counts shelf life from the item's addedAt (when
 * it entered the pantry), not from "now" — repairing a week-old item must not
 * gift it a week of extra life.
 */

import { addDaysUTC, suggestShelfLifeDays, suggestStorageLocation } from './shelfLife.ts';

export interface RepairCandidate {
  id: string;
  name: string;
  location: string;
  addedAt: string;
  expiresAt?: string;
}

export interface RepairProposal {
  itemId: string;
  name: string;
  currentLocation: string;
  /** Differs from currentLocation when the item seems to live elsewhere. */
  suggestedLocation: string;
  currentExpiresAt: string;
  /** UTC-midnight ISO, anchored at addedAt. */
  suggestedExpiresAt: string;
  /** Signed day delta (suggested - current). Negative = expires sooner. */
  deltaDays: number;
}

const MS_PER_DAY = 86_400_000;

/** Proposals below this |delta| with an unchanged location are noise, not repair. */
export const MIN_REPAIR_DELTA_DAYS = 2;

/**
 * Compute repair proposals for a pantry snapshot.
 *
 * Skipped:
 *  - items with no expiresAt (the user left it blank — nothing to repair)
 *  - items with unparseable dates
 *  - items the inference has no signal for (no food match, no category)
 *  - items where the suggestion agrees with what's stored (same location and
 *    |delta| < MIN_REPAIR_DELTA_DAYS)
 *
 * Output preserves input order (the caller's list is already soonest-first).
 */
export function suggestDateRepairs(items: RepairCandidate[]): RepairProposal[] {
  const proposals: RepairProposal[] = [];

  for (const item of items) {
    if (!item.expiresAt) continue;
    const currentMs = new Date(item.expiresAt).getTime();
    if (Number.isNaN(currentMs)) continue;
    const added = new Date(item.addedAt);
    if (Number.isNaN(added.getTime())) continue;

    const suggestedLocation = suggestStorageLocation(item.name) ?? item.location;
    const days = suggestShelfLifeDays({ name: item.name, location: suggestedLocation });
    if (days === null) continue;

    const suggested = addDaysUTC(added, days);
    const deltaDays = Math.round((suggested.getTime() - currentMs) / MS_PER_DAY);
    const locationChanged = suggestedLocation !== item.location;

    if (!locationChanged && Math.abs(deltaDays) < MIN_REPAIR_DELTA_DAYS) continue;

    proposals.push({
      itemId: item.id,
      name: item.name,
      currentLocation: item.location,
      suggestedLocation,
      currentExpiresAt: item.expiresAt,
      suggestedExpiresAt: suggested.toISOString(),
      deltaDays,
    });
  }

  return proposals;
}

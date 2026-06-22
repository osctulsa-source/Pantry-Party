/**
 * useActivity — reactive household activity log for the History screen and the
 * Favorites "you cook these often" section. Wraps PowerSync useQuery over
 * activity_events (deleted=0, active household, newest first) and validates each
 * row through core (bad rows skipped).
 */
import { useMemo } from 'react';
import { useQuery } from '@powersync/react-native';

import type { ActivityEvent } from '@breadbox/core';
import type { ActivityEventRow } from '../../data/powersync/schema';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { mapActivityRows } from './recordActivity';

const ACTIVITY_QUERY =
  'SELECT * FROM activity_events WHERE deleted = 0 AND household_id = ? ORDER BY occurred_at DESC';

export function useActivity(): { events: ActivityEvent[]; isLoading: boolean } {
  const { activeHouseholdId } = useActiveHousehold();
  const { data: rows, isLoading } = useQuery<ActivityEventRow>(ACTIVITY_QUERY, [
    activeHouseholdId ?? '',
  ]);
  const events = useMemo(() => mapActivityRows(rows), [rows]);
  return { events, isLoading };
}

/**
 * Top recipes by cook count (Favorites "you cook these often"). Pure over the
 * already-loaded events — groups 'cooked' entries by recipe id (refId), counts,
 * sorts desc, takes `limit`.
 */
export function topCooked(
  events: ActivityEvent[],
  limit: number,
): Array<{ recipeId: number; title: string; count: number }> {
  const byId = new Map<number, { title: string; count: number }>();
  for (const e of events) {
    if (e.kind !== 'cooked' || !e.refId) continue;
    const id = Number(e.refId);
    if (!Number.isFinite(id)) continue;
    const prev = byId.get(id);
    if (prev) prev.count += 1;
    else byId.set(id, { title: e.label, count: 1 });
  }
  return [...byId.entries()]
    .map(([recipeId, v]) => ({ recipeId, title: v.title, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

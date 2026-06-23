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

// topCooked moved to @breadbox/core (taste.ts) so it is unit-tested without
// React Native; re-exported here so existing importers stay unchanged.
export { topCooked } from '@breadbox/core';

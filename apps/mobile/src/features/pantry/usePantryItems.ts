/**
 * usePantryItems — reactive, household-scoped pantry read.
 *
 * One hook for any screen that needs the live pantry: wraps PowerSync's
 * useQuery over the canonical pantry SELECT (deleted = 0, active household,
 * soonest-expiring first) and validates each row through @breadbox/core's
 * parsePantryItem on the way out.
 *
 * Replaces one-shot powerSyncPantry.list() reads. Two fixes in one:
 *   1. Reactivity — consumers re-render on every local write or sync delivery,
 *      so a persistent screen (e.g. the Cook tab) never goes stale after a
 *      cook-decrement or a pantry edit.
 *   2. Household scoping — list() had no household filter, so a multi-household
 *      user's recipe search quietly read items from ALL their households.
 *
 * RecipesScreen is the first consumer. PantryScreen keeps its own inline query
 * for now (it owns extra concerns: search + sectioning); unifying it onto this
 * hook is a Phase 3 cleanup.
 */
import { useMemo } from 'react';
import { useQuery } from '@powersync/react-native';

import type { PantryItem } from '@breadbox/core';
import { rowToPantryItem } from '../../data/powersync/mapRow';
import type { PantryItemRow } from '../../data/powersync/schema';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';

const PANTRY_QUERY =
  'SELECT * FROM pantry_items WHERE deleted = 0 AND household_id = ? ' +
  'ORDER BY (expires_at IS NULL), expires_at ASC, name ASC';

export function usePantryItems(): {
  items: PantryItem[];
  isLoading: boolean;
  error: Error | undefined;
} {
  const { activeHouseholdId } = useActiveHousehold();
  const { data: rows, isLoading, error } = useQuery<PantryItemRow>(PANTRY_QUERY, [
    activeHouseholdId ?? '',
  ]);
  const items = useMemo(() => rows.map(rowToPantryItem), [rows]);
  return { items, isLoading, error: error ?? undefined };
}

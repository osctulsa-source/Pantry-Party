/**
 * useCollections — reactive variety-collection progress for the active
 * household, computed off the pantry history via @breadbox/core.
 *
 * Data source is deliberate: we query DISTINCT names across the household's
 * WHOLE pantry_items table — with NO `deleted = 0` filter — so a variety stays
 * collected after the item is eaten or removed. A collection you can lose by
 * cooking dinner would be the opposite of a collection. (usePantryItems /
 * usePersonalBank filter deleted rows on purpose; this hook must not.)
 *
 * Reactive through PowerSync's useQuery, so logging a new variety updates the
 * screen live. computeCollections is pure and cheap (a fold over DISTINCT
 * names, always a small set), so the useMemo keeps it off the render path.
 */
import { useMemo } from 'react';
import { useQuery } from '@powersync/react-native';

import { computeCollections, type CollectionsSummary } from '@breadbox/core';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';

// No `deleted` filter — the collection spans the household's entire history.
const NAMES_QUERY = 'SELECT DISTINCT name FROM pantry_items WHERE household_id = ?';

export function useCollections(): {
  collections: CollectionsSummary;
  isLoading: boolean;
} {
  const { activeHouseholdId } = useActiveHousehold();
  const { data, isLoading } = useQuery<{ name: string }>(NAMES_QUERY, [
    activeHouseholdId ?? '',
  ]);
  const collections = useMemo(
    () => computeCollections(data.map((r) => r.name)),
    [data],
  );
  return { collections, isLoading };
}

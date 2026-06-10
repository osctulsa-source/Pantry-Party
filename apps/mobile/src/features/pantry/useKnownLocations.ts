/**
 * useKnownLocations — the set of storage locations to offer in the picker:
 * the built-in defaults plus any custom locations already used in this
 * household's pantry (derived from synced pantry_items, so a teammate's "Garage"
 * shows up for everyone). Returns a de-duped, ordered string list.
 */
import { useMemo } from 'react';
import { useQuery } from '@powersync/react-native';
import { DEFAULT_LOCATIONS } from '@breadbox/core';

const KNOWN_QUERY =
  'SELECT DISTINCT location FROM pantry_items WHERE deleted = 0 AND household_id = ? ORDER BY location';

export function useKnownLocations(householdId: string | null): string[] {
  const { data } = useQuery<{ location: string }>(KNOWN_QUERY, [householdId ?? '']);
  return useMemo(() => {
    const set = new Set<string>(DEFAULT_LOCATIONS);
    for (const row of data) {
      if (row.location) set.add(row.location);
    }
    return [...set];
  }, [data]);
}

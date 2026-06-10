/**
 * usePersonalBank — the per-user "items you've added before" bank, derived from
 * the already-synced pantry history (no new backend). Reactively queries the
 * household's pantry_items filtered to the current user (added_by), de-duped by
 * name, most-recent first. Because pantry_items syncs via PowerSync, this bank
 * follows the user across their devices automatically.
 *
 * Location is a free string in core (built-ins + custom labels like "Garage"),
 * so we carry the stored value through verbatim — re-adding from the bank lands
 * the item back in whatever location it last lived in.
 */
import { useMemo } from 'react';
import { useQuery } from '@powersync/react-native';
import type { StorageLocation } from '@breadbox/core';

export interface BankItem {
  name: string;
  location: StorageLocation;
}

const BANK_QUERY =
  'SELECT name, location, MAX(added_at) AS last_added FROM pantry_items ' +
  'WHERE household_id = ? AND added_by = ? GROUP BY name ORDER BY last_added DESC LIMIT 24';

export function usePersonalBank(householdId: string | null, userId: string | null): BankItem[] {
  const { data } = useQuery<{ name: string; location: string }>(BANK_QUERY, [
    householdId ?? '',
    userId ?? '',
  ]);
  return useMemo(() => data.map((r) => ({ name: r.name, location: r.location })), [data]);
}

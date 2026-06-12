/**
 * useLearnedBrands — brand suggestions from the household's own history.
 *
 * Reactive query over the synced pantry_items: distinct brands previously
 * used on items whose name contains the given term, most recently used
 * first. "You usually buy Barilla" — personal, current, zero new backend
 * (same derived-from-synced-data approach as usePersonalBank).
 *
 * Deliberately INCLUDES tombstoned rows: consumed items are exactly the
 * brand history we want ("the oat milk you finished last week was Oatly").
 * This differs from usePersonalBank's deleted = 0 filter, where resurfacing
 * deleted items as add-targets was a bug — here history is the feature.
 *
 * The term is the generic food when a food guide matched ("Penne pasta" →
 * "pasta", so any pasta purchase counts) or the raw typed name otherwise
 * ("sriracha" → the brand you bought before).
 */
import { useQuery } from '@powersync/react-native';

const QUERY =
  "SELECT brand, MAX(updated_at) AS last_used FROM pantry_items " +
  "WHERE household_id = ? AND brand IS NOT NULL AND TRIM(brand) != '' " +
  "AND LOWER(name) LIKE '%' || ? || '%' " +
  'GROUP BY brand ORDER BY last_used DESC LIMIT 6';

export function useLearnedBrands(householdId: string | null, term: string): string[] {
  const cleaned = term.trim().toLowerCase();
  // Terms under 3 chars return nothing (avoid noise while typing). The guard
  // blanks the household id — guaranteed zero rows. (An empty LIKE term would
  // match everything, and any "impossible substring" sentinel is one odd item
  // name away from being possible.)
  const activeHousehold = cleaned.length >= 3 ? (householdId ?? '') : '';
  const { data } = useQuery<{ brand: string }>(QUERY, [activeHousehold, cleaned]);
  return data.map((row) => row.brand);
}

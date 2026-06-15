/**
 * useInsights — reads both on-device event stores and runs the pure
 * computeInsights engine, returning a live InsightsSummary.
 *
 * Re-reads on mount and when the household changes. The event stores are
 * AsyncStorage (not reactive), so a rescue/toss during the same app session
 * won't update the summary until the next mount or foreground — acceptable
 * for a dashboard that users visit deliberately, not a live ticker.
 * (A useFocusEffect refetch would fix this if testing shows it matters.)
 */
import { useEffect, useState } from 'react';

import { computeInsights, type InsightsSummary } from '@breadbox/core';
import { readExpiryEvents } from '../pantry/expiryEvents';
import { readCookEvents } from '../recipes/cookLog';

const EMPTY: InsightsSummary = {
  streakDays: 0,
  bestStreak: 0,
  totalRescues: 0,
  totalTossed: 0,
  totalCooks: 0,
  estimatedSavings: 0,
};

export function useInsights(householdId: string | null): {
  insights: InsightsSummary;
  loading: boolean;
} {
  const [insights, setInsights] = useState<InsightsSummary>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setInsights(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [expiry, cooks] = await Promise.all([
        readExpiryEvents(householdId),
        readCookEvents(householdId),
      ]);
      if (cancelled) return;
      setInsights(computeInsights(expiry, cooks, new Date()));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  return { insights, loading };
}

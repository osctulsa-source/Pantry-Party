/**
 * collections — pure computation of "variety collection" progress over the
 * household's logged item names (no I/O).
 *
 * The premise (and why it doesn't fight the core product): the foodKinds
 * taxonomy already enumerates the common KINDS of each staple (pasta → Penne,
 * Spaghetti…; cheese → Cheddar, Mozzarella…; grapes → Concord, Champagne…).
 * That same list doubles as a *collectible set*. Every time you log a SPECIFIC
 * variety — "Cheddar cheese", "Basmati rice", "Fuji apples" — you fill one
 * slot. Logging the generic ("cheese") fills nothing.
 *
 * That single rule is what keeps the game honest:
 *   - No artificial scarcity. A slot fills only because you genuinely bought
 *     that thing — the reward mirrors a real pantry, it never withholds a
 *     recipe or gates core info.
 *   - The game and the utility pull the SAME direction. Rewarding specificity
 *     is exactly what the Add form already nudges toward, and specific names
 *     make recipe matching better (see foodKinds). Collecting = better data.
 *   - Un-grindable by construction. A set advances on DISTINCT varieties, so
 *     buying the same thing twice earns nothing; the only way forward is to
 *     branch out — which is the whole "gotta collect 'em all" pull.
 *
 * Durability: the caller feeds DISTINCT names across the household's ENTIRE
 * pantry history (including consumed/removed rows), so a variety you collected
 * stays collected after you eat it — you can't lose a Pokédex entry by cooking
 * dinner. This module doesn't know or care; it just counts names.
 *
 * Pure + deterministic: names in, summary out. No dates, no storage, no RNG —
 * mirrors streakStats so the same test style applies.
 */

import { FOOD_GUIDES, guideFor, plainName } from './foodKinds.ts';

export interface CollectionSet {
  /** The guide's canonical food key, lowercase ("cheese"). */
  food: string;
  /** Display title ("Cheese"). */
  title: string;
  /** Kinds logged at least once, in the guide's canonical order. */
  collected: string[];
  /** Kinds not yet logged, in the guide's canonical order. */
  remaining: string[];
  /** collected.length — the filled slots. */
  count: number;
  /** Total collectible kinds in this set. */
  total: number;
  /** True once every kind has been logged (the set is a trophy). */
  complete: boolean;
}

export interface CollectionsSummary {
  /** Per-food sets, ordered for display: active (closest-to-done) first, then
   *  completed trophies, then untouched sets. */
  sets: CollectionSet[];
  /** Distinct varieties collected across every set. */
  varietiesCollected: number;
  /** Total collectible varieties across every guide. */
  varietiesTotal: number;
  /** Number of fully-completed sets. */
  setsComplete: number;
  /** Total number of sets. */
  setsTotal: number;
  /** The in-progress set nearest to completion — the "just N more!" nudge.
   *  null when nothing is started or everything is already complete. */
  nearestToComplete: CollectionSet | null;
}

/** Display ordering: 0 = in progress (the pull), 1 = complete (trophy), 2 = untouched. */
function tier(set: CollectionSet): number {
  if (set.count > 0 && !set.complete) return 0;
  if (set.complete) return 1;
  return 2;
}

/**
 * Fold a list of logged item names into per-food collection progress.
 * Only names that resolve to a SPECIFIC variety (via foodKinds.guideFor)
 * advance a set; generic and unrelated names are ignored. Duplicates are
 * naturally de-duped through the per-food kind Set, so the caller may pass
 * raw or DISTINCT names — the result is identical.
 */
export function computeCollections(loggedNames: string[]): CollectionsSummary {
  // food → set of collected kind labels (canonical display case from the guide).
  const collectedByFood = new Map<string, Set<string>>();
  for (const name of loggedNames) {
    const match = guideFor(name);
    if (!match?.activeKind) continue; // generic or non-guide name — no slot
    let set = collectedByFood.get(match.guide.food);
    if (!set) {
      set = new Set<string>();
      collectedByFood.set(match.guide.food, set);
    }
    set.add(match.activeKind);
  }

  const sets: CollectionSet[] = FOOD_GUIDES.map((guide) => {
    const seen = collectedByFood.get(guide.food) ?? new Set<string>();
    const collected = guide.kinds.filter((k) => seen.has(k));
    const remaining = guide.kinds.filter((k) => !seen.has(k));
    return {
      food: guide.food,
      title: plainName(guide),
      collected,
      remaining,
      count: collected.length,
      total: guide.kinds.length,
      complete: remaining.length === 0,
    };
  });

  sets.sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    // Active sets: closest to done first, then most collected.
    if (ta === 0) {
      if (a.remaining.length !== b.remaining.length) return a.remaining.length - b.remaining.length;
      if (a.count !== b.count) return b.count - a.count;
    }
    // Completed trophies: bigger sets read as the greater achievement.
    if (ta === 1 && a.total !== b.total) return b.total - a.total;
    return a.title.localeCompare(b.title);
  });

  const varietiesCollected = sets.reduce((sum, s) => sum + s.count, 0);
  const varietiesTotal = sets.reduce((sum, s) => sum + s.total, 0);
  const setsComplete = sets.filter((s) => s.complete).length;
  // After the sort, the first tier-0 set (if any) is the nearest to completion.
  const nearestToComplete = sets.find((s) => tier(s) === 0) ?? null;

  return {
    sets,
    varietiesCollected,
    varietiesTotal,
    setsComplete,
    setsTotal: sets.length,
    nearestToComplete,
  };
}

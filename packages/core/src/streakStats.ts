/**
 * streakStats — pure computation over the on-device event logs (no I/O).
 *
 * Three data sources feed in:
 *   - expiryEvents (used/tossed, cap 200) — the rescue + waste signal
 *   - cookLog (cook confirmations, cap 100) — the positive-action signal
 *   - scanLog (barcode hits, cap 500) — capture accuracy (not used here yet)
 *
 * Streak definition (locked decision): consecutive calendar days with ZERO
 * 'tossed' events, walking backward from `now`. Days with no events at all
 * do NOT break the streak — only explicit waste does. This is the positive
 * framing: "you haven't thrown food away in N days," not "you used the app
 * N days in a row." A brand-new user with no events has a streak of 0 (not
 * infinite — you earn it by having at least one rescue or cook).
 *
 * Savings: count of 'used' (rescue) events × $2.50 — the EPA's per-item
 * average for a US household of four ($2,913/year ÷ ~1,165 items). Rounded
 * to the nearest dollar. Deliberately conservative and sourced — the number
 * should feel honest, not gamified.
 *
 * Best streak: the longest run found anywhere in the event history, so the
 * user sees their personal record even after a break.
 */

/** The ExpiryEvent shape from expiryEvents.ts — imported as a type-only
 *  dependency so this module stays pure (no AsyncStorage import). */
export interface ExpiryEventInput {
  kind: 'used' | 'tossed';
  itemName: string;
  at: string; // ISO
}

/** The CookEvent shape from cookLog.ts. */
export interface CookEventInput {
  recipeId: number;
  recipeTitle: string;
  cookedAt: string; // ISO
  itemsUsed: number;
}

export interface InsightsSummary {
  /** Current streak: consecutive days (from today backward) with no waste. */
  streakDays: number;
  /** Longest streak ever recorded in the event history. */
  bestStreak: number;
  /** Total items rescued (used while in the warning/expired window). */
  totalRescues: number;
  /** Total items tossed (voluntary waste acknowledgment). */
  totalTossed: number;
  /** Total confirmed cooks. */
  totalCooks: number;
  /** Estimated dollars saved — rescues × EPA per-item average. */
  estimatedSavings: number;
}

const EPA_PER_ITEM_USD = 2.5;

/** YYYY-MM-DD in the local timezone — the calendar-day key. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function prevDay(key: string): string {
  const d = new Date(`${key}T12:00:00`); // noon to dodge DST edges
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

/**
 * Walk backward from `startDay` through the tossed-days set: each day that
 * is NOT in the set extends the streak by 1. Stop the moment we hit a day
 * that IS in the set OR we've walked past the earliest event in the log
 * (we can't credit days before the user started tracking). Returns the
 * streak length (0 when the log is empty or when today has waste).
 */
function walkStreak(startDay: string, tossedDays: Set<string>, earliestDay: string): number {
  if (!earliestDay) return 0;
  let days = 0;
  let cursor = startDay;
  while (cursor >= earliestDay) {
    if (tossedDays.has(cursor)) break;
    days += 1;
    cursor = prevDay(cursor);
  }
  return days;
}

/**
 * Find the longest waste-free run anywhere in the history — the user's
 * personal best. Walks forward from the earliest event day to the latest,
 * resetting on tossed days, tracking the max.
 */
function bestStreakInHistory(
  allDays: string[],
  tossedDays: Set<string>,
): number {
  if (allDays.length === 0) return 0;
  const sorted = [...allDays].sort();
  const first = sorted[0] as string;
  const last = sorted[sorted.length - 1] as string;
  let best = 0;
  let run = 0;
  let cursor = first;
  while (cursor <= last) {
    if (tossedDays.has(cursor)) {
      run = 0;
    } else {
      run += 1;
      if (run > best) best = run;
    }
    // Step to next day
    const d = new Date(`${cursor}T12:00:00`);
    d.setDate(d.getDate() + 1);
    cursor = todayKey(d);
  }
  return best;
}

export function computeInsights(
  expiryEvents: ExpiryEventInput[],
  cookEvents: CookEventInput[],
  now: Date = new Date(),
): InsightsSummary {
  const totalRescues = expiryEvents.filter((e) => e.kind === 'used').length;
  const totalTossed = expiryEvents.filter((e) => e.kind === 'tossed').length;
  const totalCooks = cookEvents.length;
  const estimatedSavings = Math.round(totalRescues * EPA_PER_ITEM_USD);

  // Collect the set of calendar days that had at least one tossed event.
  const tossedDays = new Set<string>();
  const allDays = new Set<string>();
  for (const e of expiryEvents) {
    const dk = dayKey(e.at);
    if (!dk) continue;
    allDays.add(dk);
    if (e.kind === 'tossed') tossedDays.add(dk);
  }
  for (const c of cookEvents) {
    const dk = dayKey(c.cookedAt);
    if (dk) allDays.add(dk);
  }

  const allDaysList = [...allDays];
  const earliestDay = allDaysList.length > 0
    ? allDaysList.sort()[0] as string
    : '';

  const today = todayKey(now);
  // Current streak: only starts counting if the user has ANY history
  // (a brand-new user with zero events gets 0, not an infinite streak).
  const streakDays = allDaysList.length > 0
    ? walkStreak(today, tossedDays, earliestDay)
    : 0;

  // Best streak: the longest waste-free run in the full history, or the
  // current streak if it's the longest (walkStreak covers today→past,
  // bestStreakInHistory covers earliest→latest which may not reach today).
  const historicalBest = bestStreakInHistory(allDaysList, tossedDays);
  const bestStreak = Math.max(streakDays, historicalBest);

  return {
    streakDays,
    bestStreak,
    totalRescues,
    totalTossed,
    totalCooks,
    estimatedSavings,
  };
}

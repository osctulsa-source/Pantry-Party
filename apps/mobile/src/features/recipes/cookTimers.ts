/**
 * cookTimers — pure helpers for cook mode's CONCURRENT step timers.
 *
 * One timer per step, any number of steps (the map key IS the stepIdx).
 * Timestamp-based: a running timer stores the wall-clock `endsAt`, so
 * backgrounding the app never drifts it; remaining is always recomputed
 * from "now". Paused timers freeze an explicit remainingSec.
 *
 * Kept free of React/Expo imports so the countdown logic is unit-testable.
 */

export type CookTimer =
  | { stepIdx: number; status: 'running'; endsAt: number; totalSec: number }
  | { stepIdx: number; status: 'paused'; remainingSec: number; totalSec: number };

export type CookTimers = ReadonlyMap<number, CookTimer>;

/** Per-step notification identifier (scheduling again for a step replaces it). */
export function timerNotifId(stepIdx: number): string {
  return `cookmode-timer-${stepIdx}`;
}

/** Seconds left on a timer at instant `now` (ms epoch). Never negative. */
export function remainingSecOf(t: CookTimer, now: number): number {
  return t.status === 'paused' ? t.remainingSec : Math.max(0, Math.round((t.endsAt - now) / 1000));
}

/** The wall-clock instant a running timer began (for system-driven countdown UI). */
export function startedAtOf(t: Extract<CookTimer, { status: 'running' }>): number {
  return t.endsAt - t.totalSec * 1000;
}

/** The running timer that ends first — the Live Activity's hero countdown. */
export function soonestRunning(timers: CookTimers): Extract<CookTimer, { status: 'running' }> | null {
  let best: Extract<CookTimer, { status: 'running' }> | null = null;
  for (const t of timers.values()) {
    if (t.status === 'running' && (best === null || t.endsAt < best.endsAt)) best = t;
  }
  return best;
}

/** Timers on steps other than the one on screen, in step order (for the pill row). */
export function otherStepTimers(timers: CookTimers, currentStepIdx: number): CookTimer[] {
  return [...timers.values()]
    .filter((t) => t.stepIdx !== currentStepIdx)
    .sort((a, b) => a.stepIdx - b.stepIdx);
}

/** Running timers that have reached zero at `now` — freeze + celebrate these. */
export function crossedZero(timers: CookTimers, now: number): CookTimer[] {
  return [...timers.values()].filter((t) => t.status === 'running' && t.endsAt - now <= 0);
}

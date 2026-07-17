/**
 * cookActivitySnapshot — pure builder for the cook Live Activity's props.
 *
 * The activity is presentation-only: the app's timers are the source of
 * truth, and we only push props on discrete events (start/pause/step/finish).
 * The per-second countdown renders SYSTEM-SIDE from `soonest`'s interval
 * (Text/ProgressView timerInterval), so no updates are needed while it ticks.
 */
import { soonestRunning, startedAtOf, type CookTimers } from '../recipes/cookTimers';

export interface CookActivitySnapshot {
  recipeTitle: string;
  /** "Step 3 of 8" — the step the cook is ON, not the timer's step. */
  stepLabel: string;
  timerCount: number;
  /** Hero countdown (soonest-ending RUNNING timer), null when all paused/none. */
  soonest: { startedAt: number; endsAt: number; stepLabel: string } | null;
  /** Shown frozen when timers exist but none run. */
  pausedRemainingSec: number | null;
}

export function buildCookActivitySnapshot(args: {
  recipeTitle: string;
  stepIdx: number;
  stepCount: number;
  timers: CookTimers;
}): CookActivitySnapshot {
  const { recipeTitle, stepIdx, stepCount, timers } = args;
  const hero = soonestRunning(timers);
  let pausedRemainingSec: number | null = null;
  if (!hero) {
    for (const t of timers.values()) {
      if (t.status === 'paused') {
        pausedRemainingSec = Math.min(pausedRemainingSec ?? Infinity, t.remainingSec);
      }
    }
    if (pausedRemainingSec === Infinity) pausedRemainingSec = null;
  }
  return {
    recipeTitle,
    stepLabel: `Step ${stepIdx + 1} of ${stepCount}`,
    timerCount: timers.size,
    soonest: hero
      ? { startedAt: startedAtOf(hero), endsAt: hero.endsAt, stepLabel: `Step ${hero.stepIdx + 1}` }
      : null,
    pausedRemainingSec,
  };
}

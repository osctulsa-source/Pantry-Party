import type { CookTimer } from '../recipes/cookTimers';
import { buildCookActivitySnapshot } from './cookActivitySnapshot';

const running = (stepIdx: number, endsAt: number, totalSec = 60): CookTimer => ({
  stepIdx,
  status: 'running',
  endsAt,
  totalSec,
});
const paused = (stepIdx: number, remainingSec: number): CookTimer => ({
  stepIdx,
  status: 'paused',
  remainingSec,
  totalSec: 60,
});

describe('buildCookActivitySnapshot', () => {
  it('heroes the soonest running timer with its interval', () => {
    const s = buildCookActivitySnapshot({
      recipeTitle: 'Weeknight Chili',
      stepIdx: 2,
      stepCount: 8,
      timers: new Map([
        [1, running(1, 500_000, 100)],
        [4, running(4, 200_000, 100)],
      ]),
    });
    expect(s.soonest).toEqual({ startedAt: 100_000, endsAt: 200_000, stepLabel: 'Step 5' });
    expect(s.timerCount).toBe(2);
    expect(s.stepLabel).toBe('Step 3 of 8');
    expect(s.pausedRemainingSec).toBeNull();
  });

  it('falls back to frozen paused time when nothing runs', () => {
    const s = buildCookActivitySnapshot({
      recipeTitle: 'Chili',
      stepIdx: 0,
      stepCount: 3,
      timers: new Map([[1, paused(1, 90)]]),
    });
    expect(s.soonest).toBeNull();
    expect(s.pausedRemainingSec).toBe(90);
  });

  it('reports no paused remaining when there are no timers at all', () => {
    const s = buildCookActivitySnapshot({
      recipeTitle: 'Chili',
      stepIdx: 0,
      stepCount: 3,
      timers: new Map(),
    });
    expect(s.soonest).toBeNull();
    expect(s.pausedRemainingSec).toBeNull();
    expect(s.timerCount).toBe(0);
  });
});

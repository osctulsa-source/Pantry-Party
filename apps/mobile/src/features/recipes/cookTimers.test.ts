import {
  type CookTimer,
  timerNotifId,
  remainingSecOf,
  startedAtOf,
  soonestRunning,
  otherStepTimers,
  crossedZero,
} from './cookTimers';

const running = (stepIdx: number, endsAt: number, totalSec = 300): CookTimer => ({
  stepIdx,
  status: 'running',
  endsAt,
  totalSec,
});
const paused = (stepIdx: number, remainingSec: number, totalSec = 300): CookTimer => ({
  stepIdx,
  status: 'paused',
  remainingSec,
  totalSec,
});

describe('timerNotifId', () => {
  it('is unique per step', () => {
    expect(timerNotifId(0)).toBe('cookmode-timer-0');
    expect(timerNotifId(7)).not.toBe(timerNotifId(3));
  });
});

describe('remainingSecOf', () => {
  it('computes running remaining from now, clamped at 0', () => {
    expect(remainingSecOf(running(0, 10_000), 4_000)).toBe(6);
    expect(remainingSecOf(running(0, 10_000), 20_000)).toBe(0);
  });
  it('returns the frozen value for paused timers', () => {
    expect(remainingSecOf(paused(0, 42), 999_999)).toBe(42);
  });
});

describe('startedAtOf', () => {
  it('derives the start instant of a running timer', () => {
    expect(startedAtOf({ stepIdx: 0, status: 'running', endsAt: 310_000, totalSec: 300 })).toBe(10_000);
  });
});

describe('soonestRunning', () => {
  it('picks the running timer that ends first, ignoring paused', () => {
    const timers = new Map<number, CookTimer>([
      [0, paused(0, 5)],
      [2, running(2, 50_000)],
      [4, running(4, 30_000)],
    ]);
    expect(soonestRunning(timers)?.stepIdx).toBe(4);
  });
  it('returns null when nothing is running', () => {
    expect(soonestRunning(new Map([[1, paused(1, 5)]]))).toBeNull();
  });
});

describe('otherStepTimers', () => {
  it('lists timers on other steps sorted by step order', () => {
    const timers = new Map<number, CookTimer>([
      [5, running(5, 1)],
      [1, running(1, 2)],
      [3, running(3, 3)],
    ]);
    expect(otherStepTimers(timers, 3).map((t) => t.stepIdx)).toEqual([1, 5]);
  });
});

describe('crossedZero', () => {
  it('finds running timers that hit zero', () => {
    const timers = new Map<number, CookTimer>([
      [0, running(0, 4_000)],
      [1, running(1, 99_000)],
      [2, paused(2, 0)],
    ]);
    expect(crossedZero(timers, 5_000).map((t) => t.stepIdx)).toEqual([0]);
  });
});

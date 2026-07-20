# Cook Feedback Layer + Concurrent Timers + Live Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concurrent cook-mode step timers, a lock-screen/Dynamic-Island Live Activity showing them, and an app-wide sound+haptic feedback layer with settings toggles.

**Architecture:** Pure timer helpers (`cookTimers.ts`) drive a `Map<stepIdx, CookTimer>` in `CookModeView`; a props builder (`cookActivitySnapshot.ts`) feeds a TS Live Activity layout rendered by the already-shipped expo-widgets extension (OTA-safe); a `feedback` module fans one call per product event out to expo-haptics now and expo-audio when the next native build lands (lazy require, try/catch). Prefs are device-local AsyncStorage with a synchronous cache.

**Tech Stack:** Expo SDK 56, expo-widgets Live Activities (`createLiveActivity`), `@expo/ui/swift-ui` (`Text`/`ProgressView` with `timerInterval`), expo-haptics, expo-audio (next build), expo-notifications, Jest (jest-expo).

**Spec:** `docs/superpowers/specs/2026-07-17-cook-feedback-timers-design.md`

**Verification commands** (run from repo root; root typecheck is broken — use the app one):
- Typecheck: `npx tsc --noEmit -p apps/mobile`
- Tests: `npm test --workspace @breadbox/mobile`
- Lint: `npm run lint`

---

### Task 1: Pure multi-timer helpers (`cookTimers.ts`)

**Files:**
- Create: `apps/mobile/src/features/recipes/cookTimers.ts`
- Test: `apps/mobile/src/features/recipes/cookTimers.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/features/recipes/cookTimers.test.ts
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
    expect(startedAtOf(running(0, 310_000, 300))).toBe(10_000);
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test --workspace @breadbox/mobile -- cookTimers`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/features/recipes/cookTimers.ts
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
```

- [ ] **Step 4: Run tests** — Expected: PASS
- [ ] **Step 5: Commit** — `feat(recipes): pure helpers for concurrent cook timers`

---

### Task 2: Feedback prefs (device-local toggles with a sync cache)

**Files:**
- Create: `apps/mobile/src/feedback/feedbackPrefs.ts`
- Test: `apps/mobile/src/feedback/feedbackPrefs.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/feedback/feedbackPrefs.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFeedbackPrefs, hydrateFeedbackPrefs, setFeedbackPref } from './feedbackPrefs';

describe('feedbackPrefs', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults both to on', async () => {
    await hydrateFeedbackPrefs();
    expect(getFeedbackPrefs()).toEqual({ sounds: true, haptics: true });
  });

  it('persists and caches a change synchronously', async () => {
    await setFeedbackPref('sounds', false);
    expect(getFeedbackPrefs().sounds).toBe(false);
    expect(await AsyncStorage.getItem('feedback.sounds')).toBe('off');
  });

  it('hydrates persisted values', async () => {
    await AsyncStorage.setItem('feedback.haptics', 'off');
    await hydrateFeedbackPrefs();
    expect(getFeedbackPrefs()).toEqual({ sounds: true, haptics: false });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test --workspace @breadbox/mobile -- feedbackPrefs` → FAIL
- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/feedback/feedbackPrefs.ts
/**
 * feedbackPrefs — the Sounds / Haptic-feedback toggles (on-device, AsyncStorage).
 *
 * Device-local like notificationPrefs: how loud your phone is, is a personal
 * choice, not household state. A module-level cache makes reads SYNCHRONOUS so
 * feedback calls on hot paths (check-offs) never await storage; hydrate runs
 * at import and on demand.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FeedbackPrefs {
  sounds: boolean;
  haptics: boolean;
}

const KEYS = { sounds: 'feedback.sounds', haptics: 'feedback.haptics' } as const;

let cache: FeedbackPrefs = { sounds: true, haptics: true };

export async function hydrateFeedbackPrefs(): Promise<FeedbackPrefs> {
  try {
    const [s, h] = await Promise.all([
      AsyncStorage.getItem(KEYS.sounds),
      AsyncStorage.getItem(KEYS.haptics),
    ]);
    cache = { sounds: s !== 'off', haptics: h !== 'off' };
  } catch {
    // Storage hiccup — keep the defaults; feedback must never break the app.
  }
  return cache;
}

export function getFeedbackPrefs(): FeedbackPrefs {
  return cache;
}

export async function setFeedbackPref(key: keyof FeedbackPrefs, value: boolean): Promise<void> {
  cache = { ...cache, [key]: value };
  try {
    await AsyncStorage.setItem(KEYS[key], value ? 'on' : 'off');
  } catch {
    // Cache already updated — worst case the choice doesn't survive a relaunch.
  }
}

// Warm the cache as soon as the module loads (fire-and-forget).
void hydrateFeedbackPrefs();
```

- [ ] **Step 4: Run tests** — PASS
- [ ] **Step 5: Commit** — `feat(feedback): device-local sound/haptic preference store`

---

### Task 3: Sound assets (procedural marimba family)

**Files:**
- Create: `apps/mobile/scripts/make-sounds.mjs`
- Create (generated, committed): `apps/mobile/assets/sounds/{tick,pop,timer-done,success}.wav`

- [ ] **Step 1: Write the generator**

```js
// apps/mobile/scripts/make-sounds.mjs
/**
 * Generates the app's four feedback sounds as tiny mono WAVs — one marimba-ish
 * timbre family (fundamental + soft 4x partial, exponential decay) so they read
 * as one brand. Deterministic: rerunning reproduces identical files.
 *
 *   node apps/mobile/scripts/make-sounds.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
const RATE = 22050;

/** One struck-bar note: sine fundamental + quiet 4th partial, exp decay. */
function note(freq, seconds, { gain = 0.5, decay = 12 } = {}) {
  const n = Math.round(RATE * seconds);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.exp(-decay * t);
    const attack = Math.min(1, t / 0.004); // 4ms attack — soft, not clicky
    out[i] =
      gain * env * attack * (Math.sin(2 * Math.PI * freq * t) + 0.18 * Math.sin(2 * Math.PI * freq * 4 * t) * Math.exp(-30 * t));
  }
  return out;
}

/** Mix notes at offsets (seconds) into one buffer. */
function mix(parts, totalSeconds) {
  const n = Math.round(RATE * totalSeconds);
  const out = new Float64Array(n);
  for (const { buf, at } of parts) {
    const start = Math.round(at * RATE);
    for (let i = 0; i < buf.length && start + i < n; i++) out[start + i] += buf[i];
  }
  // Normalize just under full scale to be polite next to podcasts.
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.7 / peak : 1;
  return out.map((v) => v * k);
}

function wav(samples) {
  const n = samples.length;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

mkdirSync(OUT, { recursive: true });

// C-major family, quiet-to-celebratory.
const sounds = {
  // Soft tick: one very short, high, quiet tap (check-offs — heard many times).
  'tick.wav': mix([{ buf: note(1318.5, 0.09, { gain: 0.22, decay: 40 }) }].map((p) => ({ at: 0, ...p })), 0.1),
  // Light pop: single mid note, quick (item added / timer started).
  'pop.wav': mix([{ at: 0, buf: note(659.3, 0.16, { gain: 0.4, decay: 22 }) }], 0.18),
  // Timer done: rising two-note "ding-ding" (G5 → C6).
  'timer-done.wav': mix(
    [
      { at: 0, buf: note(784, 0.3, { gain: 0.45, decay: 10 }) },
      { at: 0.16, buf: note(1046.5, 0.4, { gain: 0.5, decay: 8 }) },
    ],
    0.6,
  ),
  // Success: three-note arpeggio C5–E5–G5 (the "I made this!" fanfare).
  'success.wav': mix(
    [
      { at: 0, buf: note(523.25, 0.35, { gain: 0.42, decay: 9 }) },
      { at: 0.12, buf: note(659.3, 0.35, { gain: 0.42, decay: 9 }) },
      { at: 0.24, buf: note(784, 0.5, { gain: 0.5, decay: 7 }) },
    ],
    0.85,
  ),
};

for (const [name, samples] of Object.entries(sounds)) {
  writeFileSync(join(OUT, name), wav(samples));
  console.log(`wrote assets/sounds/${name} (${wav(samples).length} bytes)`);
}
```

- [ ] **Step 2: Run it** — `node apps/mobile/scripts/make-sounds.mjs` → four files, each well under 50 KB.
- [ ] **Step 3: Commit** — `feat(feedback): procedural marimba sound palette (4 wavs + generator)`

---

### Task 4: The `feedback` module (haptics now, sounds when native build lands)

**Files:**
- Create: `apps/mobile/src/feedback/feedback.ts`
- Test: `apps/mobile/src/feedback/feedback.test.ts`
- Modify: `apps/mobile/package.json` (add `"expo-audio": "~56.0.6"` to dependencies)

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/feedback/feedback.test.ts
import * as Haptics from 'expo-haptics';
import { feedback } from './feedback';
import { setFeedbackPref } from './feedbackPrefs';

jest.mock('expo-audio', () => {
  throw new Error('native module missing (old build)');
});

describe('feedback', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await setFeedbackPref('haptics', true);
    await setFeedbackPref('sounds', true);
  });

  it('fires the matching haptic per event', () => {
    feedback.tick();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    feedback.pop();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    feedback.success();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('respects the haptics toggle', async () => {
    await setFeedbackPref('haptics', false);
    feedback.tick();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('never throws when expo-audio is unavailable', () => {
    expect(() => {
      feedback.tick();
      feedback.pop();
      feedback.timerDone();
      feedback.success();
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (module not found)
- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/feedback/feedback.ts
/**
 * feedback — ONE call per product event; the module fans out to the matching
 * haptic (expo-haptics, in every build) and sound (expo-audio, present only in
 * native builds made after 2026-07-17).
 *
 * Duolingo-discipline: exactly four events, palette generated by
 * scripts/make-sounds.mjs. Frequency scales inversely with reward weight —
 * tick is nearly silent, success is the fanfare. Add a fifth only with a
 * design-level reason.
 *
 * OTA safety: expo-audio is REQUIRED LAZILY inside try/catch. On installed
 * builds whose native side predates it, the require (or its native call)
 * throws once, we mark audio 'unavailable', and every call degrades to
 * haptics-only. Feedback must never crash cooking.
 *
 * Audio session: ambient + mix-with-others — people cook to podcasts; we never
 * duck or interrupt them, and we respect the silent switch.
 */
import * as Haptics from 'expo-haptics';

import { getFeedbackPrefs } from './feedbackPrefs';

type SoundName = 'tick' | 'pop' | 'timerDone' | 'success';

// Static requires so Metro bundles the assets; tiny (all four < 100 KB).
const SOUND_SOURCES: Record<SoundName, number> = {
  tick: require('../../assets/sounds/tick.wav'),
  pop: require('../../assets/sounds/pop.wav'),
  timerDone: require('../../assets/sounds/timer-done.wav'),
  success: require('../../assets/sounds/success.wav'),
};

type AudioPlayerLike = { seekTo(sec: number): void; play(): void };
let players: Partial<Record<SoundName, AudioPlayerLike>> | 'unavailable' | null = null;

function ensureAudio(): Partial<Record<SoundName, AudioPlayerLike>> | null {
  if (players === 'unavailable') return null;
  if (players) return players;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const audio = require('expo-audio') as typeof import('expo-audio');
    void audio.setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
    });
    players = {
      tick: audio.createAudioPlayer(SOUND_SOURCES.tick),
      pop: audio.createAudioPlayer(SOUND_SOURCES.pop),
      timerDone: audio.createAudioPlayer(SOUND_SOURCES.timerDone),
      success: audio.createAudioPlayer(SOUND_SOURCES.success),
    };
    return players;
  } catch {
    players = 'unavailable'; // Old native build — haptics-only from here on.
    return null;
  }
}

function play(name: SoundName): void {
  if (!getFeedbackPrefs().sounds) return;
  try {
    const p = ensureAudio()?.[name];
    if (!p) return;
    p.seekTo(0);
    p.play();
  } catch {
    // Never let a sound break an interaction.
  }
}

function haptic(fire: () => Promise<void>): void {
  if (!getFeedbackPrefs().haptics) return;
  fire().catch(() => {});
}

export const feedback = {
  /** Small confirmations heard many times: check-offs, toggles, selections. */
  tick(): void {
    haptic(() => Haptics.selectionAsync());
    play('tick');
  },
  /** Something entered the world: pantry item added, timer started. */
  pop(): void {
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    play('pop');
  },
  /** A foreground timer reached zero. */
  timerDone(): void {
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    play('timerDone');
  },
  /** The big one — finishing a cook ("I made this!"). */
  success(): void {
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    play('success');
  },
};
```

- [ ] **Step 4:** Add `"expo-audio": "~56.0.6"` to `apps/mobile/package.json` dependencies (alphabetical slot after `expo`), run `npm install`.
- [ ] **Step 5: Fingerprint guard.** Run `npx @expo/fingerprint apps/mobile` (or `npx expo-updates fingerprint:generate` per docs/TESTFLIGHT.md) **before and after** the install and compare hashes. If adding the package changes the fingerprint, note it in the PR: the OTA slice must be published from a commit WITHOUT expo-audio in the lockfile, or sounds move wholesale to the build PR. (Memory: OTA only delivers when published runtime == installed fingerprint.)
- [ ] **Step 6:** Jest may need the wav extension: check `jest-expo` handles `.wav` via its default asset transform (it does — assetFileTransformer). If resolution fails, add to `apps/mobile/package.json` jest config: `"moduleNameMapper": { "\\.(wav)$": "<rootDir>/test/assetStub.js" }` with `module.exports = 1;`.
- [ ] **Step 7: Run tests** — PASS
- [ ] **Step 8: Commit** — `feat(feedback): one-call feedback module (haptics now, audio next build)`

---

### Task 5: Cook Live Activity — props builder

**Files:**
- Create: `apps/mobile/src/features/widget/cookActivitySnapshot.ts`
- Test: `apps/mobile/src/features/widget/cookActivitySnapshot.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/src/features/widget/cookActivitySnapshot.test.ts
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
});
```

- [ ] **Step 2: Run to verify failure** — FAIL
- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/features/widget/cookActivitySnapshot.ts
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
```

- [ ] **Step 4: Run tests** — PASS
- [ ] **Step 5: Commit** — `feat(widget): cook Live Activity props builder`

---

### Task 6: Cook Live Activity — layout + app-side controller

**Files:**
- Create: `apps/mobile/src/features/widget/CookLiveActivity.tsx` (the `'widget'` layout)
- Create: `apps/mobile/src/features/widget/cookActivity.ts` (no-op for Android)
- Create: `apps/mobile/src/features/widget/cookActivity.ios.ts` (controller)
- Modify: `apps/mobile/src/features/widget/widgetLinks.ts` (add `COOK_ACTIVITY_URL`)

No unit tests: the layout runs only in the widget extension runtime and the controller is a thin expo-widgets wrapper — both are covered by on-device QA (spec §Testing).

- [ ] **Step 1: Add the deep link**

In `widgetLinks.ts` append:

```ts
export const COOK_ACTIVITY_URL = `${APP_URL_SCHEME}://cook`;
```

- [ ] **Step 2: Write the layout**

```tsx
// apps/mobile/src/features/widget/CookLiveActivity.tsx
/**
 * Cook Live Activity — the running cook session on the lock screen and in the
 * Dynamic Island. Rendered by the generic WidgetLiveActivity already inside
 * the shipped expo-widgets extension, so this layout is OTA-shippable.
 *
 * Widget-runtime rules (same as ExpiringSoonWidget): the function body is
 * serialized and evaluated in the extension — everything it needs must arrive
 * via props or be defined inline; only @expo/ui primitives.
 *
 * The countdown/progress use timerInterval so the SYSTEM ticks them — the app
 * only pushes props on discrete events (start/pause/step change/finish).
 */
import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import type { CookActivitySnapshot } from './cookActivitySnapshot';
import type { WidgetThemePair } from './widgetTheme';

export interface CookActivityProps extends CookActivitySnapshot {
  brandName: string;
  theme: WidgetThemePair;
}

const CookLiveActivityView = (props: CookActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.theme.dark : props.theme.light;
  const hero = props.soonest;
  const extra = props.timerCount - 1;

  const clock = (size: number, weight: 'bold' | 'semibold') =>
    hero ? (
      <Text
        timerInterval={{ lower: new Date(hero.startedAt), upper: new Date(hero.endsAt) }}
        countsDown
        modifiers={[font({ size, weight, design: 'rounded' }), foregroundStyle(c.accent)]}
      />
    ) : (
      <Text modifiers={[font({ size, weight, design: 'rounded' }), foregroundStyle(c.inkMuted)]}>
        {props.pausedRemainingSec !== null
          ? `${Math.floor(props.pausedRemainingSec / 60)}:${String(props.pausedRemainingSec % 60).padStart(2, '0')} paused`
          : props.stepLabel}
      </Text>
    );

  const banner = (
    <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 14 })]}>
      <HStack spacing={5}>
        <Image systemName="frying.pan.fill" size={13} color={c.accent} />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(c.inkMuted)]}>
          {props.brandName}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(c.inkMuted)]}>
          {props.stepLabel}
        </Text>
      </HStack>
      <HStack spacing={8}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle(c.ink), lineLimit(1)]}>
            {props.recipeTitle}
          </Text>
          {hero ? (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}>
              {extra > 0 ? `${hero.stepLabel} timer · +${extra} more` : `${hero.stepLabel} timer`}
            </Text>
          ) : (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}>
              {props.timerCount > 0 ? 'Timers paused' : 'Cooking along'}
            </Text>
          )}
        </VStack>
        <Spacer />
        {clock(28, 'bold')}
      </HStack>
      {hero ? (
        <ProgressView
          timerInterval={{ lower: new Date(hero.startedAt), upper: new Date(hero.endsAt) }}
          countsDown
        />
      ) : null}
    </VStack>
  );

  return {
    banner,
    compactLeading: <Image systemName="timer" size={14} color={c.accent} />,
    compactTrailing: clock(14, 'semibold'),
    minimal: <Image systemName="timer" size={14} color={c.accent} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 6 })]}>
        <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(c.ink), lineLimit(1)]}>
          {props.recipeTitle}
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(c.inkMuted)]}>{props.stepLabel}</Text>
      </VStack>
    ),
    expandedTrailing: clock(22, 'bold'),
    expandedBottom: hero ? (
      <ProgressView
        timerInterval={{ lower: new Date(hero.startedAt), upper: new Date(hero.endsAt) }}
        countsDown
      />
    ) : null,
  };
};

export const CookLiveActivity = createLiveActivity<CookActivityProps>(
  'CookLiveActivity',
  CookLiveActivityView,
);
```

- [ ] **Step 3: Write the controller pair**

```ts
// apps/mobile/src/features/widget/cookActivity.ts
/**
 * cookActivity (non-iOS) — Live Activities are an iOS concept; Android/no-op.
 * Platform-split keeps expo-widgets' live-activity path out of other bundles
 * (mirrors useExpiringWidget.ts).
 */
import type { CookActivitySnapshot } from './cookActivitySnapshot';

export function syncCookActivity(_snapshot: CookActivitySnapshot): void {}
export function endCookActivity(): void {}
```

```ts
// apps/mobile/src/features/widget/cookActivity.ios.ts
/**
 * cookActivity (iOS) — starts/updates/ends the one cook-session Live Activity.
 *
 * One activity per cook session (Apple's pattern), keyed by nothing more than
 * module state: CookModeView is a single modal, so at most one session exists.
 * Best-effort throughout: Live Activities can be disabled per-app in iOS
 * Settings, and older installed builds may predate the extension — every call
 * is try/caught and the in-app timers remain the source of truth.
 */
import { tokens } from '../../theme/tokens';
import type { CookActivitySnapshot } from './cookActivitySnapshot';
import { CookLiveActivity, type CookActivityProps } from './CookLiveActivity';
import { buildWidgetThemePair } from './widgetTheme';
import { COOK_ACTIVITY_URL } from './widgetLinks';

type Activity = ReturnType<typeof CookLiveActivity.start>;
let activity: Activity | null = null;

function toProps(snapshot: CookActivitySnapshot): CookActivityProps {
  return { ...snapshot, brandName: tokens.brandName, theme: buildWidgetThemePair() };
}

/** Push the current cook state. Starts the activity on the first timer. */
export function syncCookActivity(snapshot: CookActivitySnapshot): void {
  try {
    if (snapshot.timerCount === 0) {
      endCookActivity();
      return;
    }
    if (activity === null) {
      // A previous session's activity can outlive a crash — clear stragglers.
      for (const stale of CookLiveActivity.getInstances()) {
        void stale.end('immediate');
      }
      activity = CookLiveActivity.start(toProps(snapshot), COOK_ACTIVITY_URL);
    } else {
      void activity.update(toProps(snapshot));
    }
  } catch {
    activity = null; // Extension missing / activities disabled — non-fatal.
  }
}

/** End the session's activity (cook mode closed or finished). */
export function endCookActivity(): void {
  try {
    activity?.end('immediate');
    activity = null;
  } catch {
    activity = null;
  }
}
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit -p apps/mobile` → clean.
- [ ] **Step 5: Commit** — `feat(widget): cook Live Activity layout + session controller`

---

### Task 7: CookModeView — concurrent timers, Live Activity sync, feedback calls

**Files:**
- Modify: `apps/mobile/src/features/recipes/CookModeView.tsx`

This is a refactor of existing single-timer state. The `CookTimer` type and
`parseMinutes`/`formatClock` stay; the single `timer` state becomes a Map.

- [ ] **Step 1: Replace imports and the local CookTimer type**

Remove the local `type CookTimer` block and `TIMER_NOTIF_ID`; import instead:

```ts
import {
  type CookTimer,
  type CookTimers,
  crossedZero,
  otherStepTimers,
  remainingSecOf,
  timerNotifId,
} from './cookTimers';
import { buildCookActivitySnapshot } from '../widget/cookActivitySnapshot';
import { endCookActivity, syncCookActivity } from '../widget/cookActivity';
import { feedback } from '../../feedback/feedback';
```

(`* as Haptics` import is removed once all call sites are migrated below.)

- [ ] **Step 2: Notification helpers become per-step**

```ts
async function scheduleTimerNotif(endsAt: number, stepIdx: number): Promise<void> {
  try {
    const ok = await ensureNotificationPermission();
    if (!ok) return;
    await Notifications.scheduleNotificationAsync({
      identifier: timerNotifId(stepIdx),
      content: { title: 'Timer done', body: `Your step ${stepIdx + 1} timer is up.`, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt) },
    });
  } catch {
    // best-effort — the in-app countdown + haptic still work without it.
  }
}

function cancelTimerNotif(stepIdx: number): void {
  Notifications.cancelScheduledNotificationAsync(timerNotifId(stepIdx)).catch(() => {});
}
```

- [ ] **Step 3: State becomes a Map; derived values via helpers**

```ts
const [timers, setTimers] = useState<ReadonlyMap<number, CookTimer>>(new Map());
const [nowTs, setNowTs] = useState(() => Date.now());

const currentTimer = timers.get(idx) ?? null;
const remaining = currentTimer ? remainingSecOf(currentTimer, nowTs) : 0;
const pillTimers = otherStepTimers(timers, idx);
const anyRunning = [...timers.values()].some((t) => t.status === 'running');
```

Map updates use a copy helper inline: `const next = new Map(prev); next.set(...); return next;`

- [ ] **Step 4: Effects**

```ts
// Tick once a second only while any timer is actually running.
useEffect(() => {
  if (!anyRunning) return;
  const id = setInterval(() => setNowTs(Date.now()), 1000);
  return () => clearInterval(id);
}, [anyRunning]);

// Zero-cross: freeze finished timers at "Time's up", chime once each, and
// drop their OS notifications (we're clearly foregrounded).
useEffect(() => {
  const finished = crossedZero(timers, nowTs);
  if (finished.length === 0) return;
  feedback.timerDone();
  setTimers((prev) => {
    const next = new Map(prev);
    for (const t of finished) {
      cancelTimerNotif(t.stepIdx);
      next.set(t.stepIdx, { stepIdx: t.stepIdx, status: 'paused', remainingSec: 0, totalSec: t.totalSec });
    }
    return next;
  });
}, [timers, nowTs]);

// Mirror timers into the lock-screen Live Activity on discrete changes only.
useEffect(() => {
  if (phase !== 'steps') return;
  syncCookActivity(
    buildCookActivitySnapshot({ recipeTitle: recipe.title, stepIdx: idx, stepCount: total, timers }),
  );
}, [phase, timers, idx, total, recipe.title]);

// Leaving cook mode ends the session: all notifications + the Live Activity.
useEffect(
  () => () => {
    Notifications.getAllScheduledNotificationsAsync()
      .then((all) =>
        all
          .filter((n) => n.identifier.startsWith('cookmode-timer-'))
          .forEach((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
      )
      .catch(() => {});
    endCookActivity();
  },
  [],
);
```

(Check the actual recipe title prop name — `SpoonacularRecipe` uses `title`.)

- [ ] **Step 5: Handlers**

```ts
function startTimer() {
  if (mins === null || timers.has(idx)) return;
  feedback.pop();
  const totalSec = mins * 60;
  const endsAt = Date.now() + totalSec * 1000;
  setNowTs(Date.now());
  setTimers((prev) => new Map(prev).set(idx, { stepIdx: idx, status: 'running', endsAt, totalSec }));
  void scheduleTimerNotif(endsAt, idx);
}

function toggleTimer(stepIdx: number) {
  const t = timers.get(stepIdx);
  if (!t) return;
  feedback.tick();
  if (t.status === 'running') {
    const rem = remainingSecOf(t, Date.now());
    cancelTimerNotif(stepIdx);
    setTimers((prev) =>
      new Map(prev).set(stepIdx, { stepIdx, status: 'paused', remainingSec: rem, totalSec: t.totalSec }),
    );
  } else {
    const endsAt = Date.now() + t.remainingSec * 1000;
    setNowTs(Date.now());
    setTimers((prev) =>
      new Map(prev).set(stepIdx, { stepIdx, status: 'running', endsAt, totalSec: t.totalSec }),
    );
    void scheduleTimerNotif(endsAt, stepIdx);
  }
}

function resetTimer(stepIdx: number) {
  cancelTimerNotif(stepIdx);
  setTimers((prev) => {
    const next = new Map(prev);
    next.delete(stepIdx);
    return next;
  });
}
```

Haptic migrations elsewhere in the file: `startCooking`/`toggleGather`/`goBack` → `feedback.tick()`; `onForward` non-last → `feedback.tick()`, last-step → `feedback.success()`.

- [ ] **Step 6: Pills row (replaces the single `timerElsewhere` pill)**

```tsx
{pillTimers.length > 0 && (
  <View style={styles.timerPillRow}>
    {pillTimers.map((t) => {
      const rem = remainingSecOf(t, nowTs);
      return (
        <Pressable
          key={t.stepIdx}
          style={styles.timerPill}
          onPress={() => setIdx(t.stepIdx)}
          accessibilityRole="button"
          accessibilityLabel={`Return to the timer on step ${t.stepIdx + 1}`}
        >
          <Timer size={14} color={tokens.color.accent} />
          <Text style={styles.timerPillTxt}>
            {rem === 0 ? `Time's up · Step ${t.stepIdx + 1}` : `${formatClock(rem)} · Step ${t.stepIdx + 1}`}
          </Text>
        </Pressable>
      );
    })}
  </View>
)}
```

New style (existing `timerPill`/`timerPillTxt` lose their margins to the row):

```ts
timerPillRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: tokens.space(2),
  marginHorizontal: tokens.space(5),
  marginTop: tokens.space(2),
},
timerPill: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: tokens.space(2),
  paddingVertical: tokens.space(1),
  paddingHorizontal: tokens.space(3),
  borderRadius: 999,
  backgroundColor: tokens.color.accentSoft,
},
```

- [ ] **Step 7: Current-step timer card** — swap `timerOnThisStep`/`timer` reads for `currentTimer`, and the control handlers for `toggleTimer(idx)` / `resetTimer(idx)`. The start button already no-ops when a timer exists (card renders instead).
- [ ] **Step 8: Typecheck + full test suite** — `npx tsc --noEmit -p apps/mobile` and `npm test --workspace @breadbox/mobile` → clean/PASS.
- [ ] **Step 9: Commit** — `feat(recipes): concurrent cook timers with Live Activity + feedback`

---

### Task 8: Settings toggles + finish-flow feedback + pantry pop

**Files:**
- Modify: `apps/mobile/src/features/settings/SettingsScreen.tsx`
- Modify: `apps/mobile/src/features/pantry/AddItemScreen.tsx:143`

- [ ] **Step 1: Settings section.** After the "Reminder time" section add:

```tsx
<View style={styles.section}>
  <Caption>Feedback</Caption>
  <View style={styles.hourChips}>
    {(
      [
        { key: 'sounds', label: 'Sounds' },
        { key: 'haptics', label: 'Haptics' },
      ] as const
    ).map((opt) => {
      const on = fbPrefs[opt.key];
      return (
        <Pressable
          key={opt.key}
          onPress={() => onToggleFeedback(opt.key)}
          style={[styles.hourChip, on && styles.hourChipOn]}
          accessibilityRole="switch"
          accessibilityState={{ checked: on }}
          accessibilityLabel={`${opt.label} ${on ? 'on' : 'off'}`}
        >
          <Text style={[styles.hourChipTxt, on && styles.hourChipTxtOn]}>{opt.label}</Text>
        </Pressable>
      );
    })}
  </View>
  <Body tone="muted" size={12}>
    Gentle taps and chimes as you cook and check things off. Sounds never interrupt your music.
  </Body>
</View>
```

With state + handler (imports: `feedback` from `../../feedback/feedback`, prefs fns from `../../feedback/feedbackPrefs`):

```ts
const [fbPrefs, setFbPrefs] = useState<FeedbackPrefs>(getFeedbackPrefs());

useEffect(() => {
  void hydrateFeedbackPrefs().then(setFbPrefs);
}, []);

function onToggleFeedback(key: keyof FeedbackPrefs) {
  const next = !fbPrefs[key];
  setFbPrefs((p) => ({ ...p, [key]: next }));
  void setFeedbackPref(key, next);
  if (next) feedback.tick(); // audible/tactile confirmation of turning it ON
}
```

- [ ] **Step 2: Pantry add pop.** In `AddItemScreen.tsx:143` replace `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});` with `feedback.pop();` (import `feedback`; drop the `Haptics` import if now unused).
- [ ] **Step 3: Typecheck + tests + lint** — all clean.
- [ ] **Step 4: Commit** — `feat(settings): sounds & haptics toggles; pantry add uses feedback layer`

---

### Task 9: Full verification + docs

- [ ] **Step 1:** `npx tsc --noEmit -p apps/mobile` → clean
- [ ] **Step 2:** `npm test --workspace @breadbox/mobile` → all suites PASS
- [ ] **Step 3:** `npm run lint` → clean
- [ ] **Step 4:** Update `docs/TESTFLIGHT.md` with a short "sounds require a fresh native build (expo-audio); OTA before that is haptics-only by design" note in the OTA section.
- [ ] **Step 5:** Commit — `docs(testflight): note expo-audio fingerprint implications`

## On-device QA (user, TestFlight/dev build)

1. Start two timers on different steps → both pills tick; each fires its own notification.
2. Lock the phone with a timer running → Live Activity shows recipe, step, ticking countdown + progress; Dynamic Island compact countdown ticks.
3. Pause all timers → activity shows frozen "paused" time. Close cook mode → activity disappears.
4. Toggle Sounds/Haptics off in Settings → interactions go quiet/still.
5. With podcast playing (next native build): sounds mix over it without ducking; silent switch mutes them.

# Settings & Tips Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the kitchen tips library to 9 categories / 72 tips with a deterministic tip of the day, device-local saved tips, and a polish pass over the Tips and Settings screens.

**Architecture:** Tip data + `tipOfTheDay` stay pure in `@breadbox/core` (vitest-tested). Favorites are a per-user AsyncStorage hook (`useSavedTips`, jest-tested) mirroring `useQuickAddConfig`. UI work: per-category icon/tone mapping (`tipArt.ts`, the stapleArt pattern), a rebuilt TipsScreen (featured card, Saved chip, bookmarks, toned card icons), grouped + iconed SettingsScreen rows via a backward-compatible `ListRow` `icon` slot.

**Tech Stack:** TypeScript, React Native (Expo), lucide-react-native, AsyncStorage, vitest (packages/core), jest + @testing-library/react-native (apps/mobile).

**Spec:** `docs/superpowers/specs/2026-07-17-settings-tips-expansion-design.md`

**Working branch:** `feat/settings-tips-expansion` (already created; spec committed).

**Commands:**
- Core tests: `npm test` from `packages/core/` (vitest; filter: `npm test -- tips`).
- Mobile tests: `npm test` from `apps/mobile/` (jest; filter: `npm test -- useSavedTips`).
- Typecheck: `npx tsc --noEmit` from `apps/mobile/` (root typecheck is known-broken; core is typechecked via vitest + the mobile project reference).
- Lint (gates CI): `npm run lint` from repo root.

---

### Task 1: Tips library expansion (core data + validation test)

Add 4 categories and 46 tips; a new vitest suite validates the library invariants. TDD order: extend the category type/meta/order first, run the new test, watch the "every category has ≥ 6 tips" case fail, then add the content.

**Files:**
- Modify: `packages/core/src/tips.ts`
- Create: `packages/core/src/tips.test.ts`
- Check: `packages/core/src/index.ts` — confirm it already re-exports `tips` (`export * from './tips'` or named exports); if named, add the new names in Task 2.

- [ ] **Step 1: Write the validation test**

Create `packages/core/src/tips.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  KITCHEN_TIPS,
  TIP_CATEGORY_META,
  TIP_CATEGORY_ORDER,
} from './tips';

describe('kitchen tips library', () => {
  it('tip ids are unique', () => {
    const ids = KITCHEN_TIPS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every tip belongs to an ordered category', () => {
    for (const tip of KITCHEN_TIPS) {
      expect(TIP_CATEGORY_ORDER).toContain(tip.category);
    }
  });

  it('order and meta cover the same category set', () => {
    expect(new Set(TIP_CATEGORY_ORDER)).toEqual(new Set(Object.keys(TIP_CATEGORY_META)));
    expect(TIP_CATEGORY_ORDER.length).toBe(Object.keys(TIP_CATEGORY_META).length);
  });

  it('every category has at least 6 tips', () => {
    for (const cat of TIP_CATEGORY_ORDER) {
      const count = KITCHEN_TIPS.filter((t) => t.category === cat).length;
      expect(count, `category ${cat}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('tip bodies are non-empty and scannable (≤ 500 chars)', () => {
    for (const tip of KITCHEN_TIPS) {
      expect(tip.body.trim().length).toBeGreaterThan(0);
      expect(tip.body.length).toBeLessThanOrEqual(500);
    }
  });
});
```

- [ ] **Step 2: Extend the category type, meta, and order in `packages/core/src/tips.ts`**

```ts
export type TipCategory =
  | 'cookware'
  | 'ingredients'
  | 'technique'
  | 'baking'
  | 'produce'
  | 'storage'
  | 'freezer'
  | 'safety'
  | 'general';
```

```ts
export const TIP_CATEGORY_META: Record<TipCategory, { label: string }> = {
  cookware: { label: 'Cookware' },
  ingredients: { label: 'Ingredients' },
  technique: { label: 'Technique' },
  baking: { label: 'Baking' },
  produce: { label: 'Produce' },
  storage: { label: 'Storage' },
  freezer: { label: 'Freezer smarts' },
  safety: { label: 'Food safety' },
  general: { label: 'General' },
};

export const TIP_CATEGORY_ORDER: TipCategory[] = [
  'cookware',
  'ingredients',
  'technique',
  'baking',
  'produce',
  'storage',
  'freezer',
  'safety',
  'general',
];
```

- [ ] **Step 3: Run the test to see the coverage case fail**

Run (from `packages/core/`): `npm test -- tips`
Expected: FAIL — "every category has at least 6 tips" reports 0 for baking, produce, freezer, safety.

- [ ] **Step 4: Add the 46 new tips to `KITCHEN_TIPS`**

Append to the existing category blocks and add four new blocks (keep the `// ── Category ──` comment style). New content, verbatim:

Cookware additions (after `cw-4`):

```ts
  { id: 'cw-5', category: 'cookware', body: 'Stainless steel sticks when the pan is not hot enough. Heat the dry pan first, then add oil, then food. Test with a drop of water — when it beads and skitters like mercury instead of sizzling away, the pan is ready.' },
  { id: 'cw-6', category: 'cookware', body: 'Wooden spoons and cutting boards never go in the dishwasher — the heat and soaking crack the grain and loosen glue joints. Hand-wash, dry upright, and rub with food-grade mineral oil once a month to keep them from drying out.' },
  { id: 'cw-7', category: 'cookware', body: 'A Dutch oven is two tools in one: sear your meat in it first, then braise in the same pot to keep every browned bit in the dish. One caution — never preheat enameled cast iron empty, as the coating can crack without contents to absorb the heat.' },
  { id: 'cw-8', category: 'cookware', body: 'An instant-read thermometer is the cheapest upgrade your cooking will ever get. It ends guesswork on roasts, bread, custards, and frying oil alike. Probe from the side toward the center of thin cuts — the tip needs to sit in the middle of the meat.' },
```

Ingredients additions (after `ig-6`):

```ts
  { id: 'ig-7', category: 'ingredients', body: 'Save your Parmesan rinds. Tossed into a pot of soup, beans, or tomato sauce, a rind slowly releases savory depth you cannot buy in a jar. Keep a bag of them in the freezer and drop one in anything that simmers longer than 20 minutes.' },
  { id: 'ig-8', category: 'ingredients', body: 'Buy whole peeled canned tomatoes and crush them by hand. Whole tomatoes are packed from the best fruit; pre-crushed and diced grades are often firmer, blander, and treated with calcium chloride so the pieces never break down in your sauce.' },
```

Technique additions (after `te-6`):

```ts
  { id: 'te-7', category: 'technique', body: 'Dry meat sears; wet meat steams. Pat every steak, chop, and chicken thigh dry with paper towels before it hits the pan — surface moisture has to boil off before browning can even begin, and by then the inside is overcooked.' },
  { id: 'te-8', category: 'technique', body: 'That cloudy pasta water is liquid gold. The starch it carries binds sauce to noodles and turns a broken, oily pan into a glossy emulsion. Scoop out a cup before you drain, finish the pasta in the sauce, and loosen with splashes of the water as you toss.' },
```

New Baking block (after the Technique block):

```ts
  // ── Baking ─────────────────────────────────────────────────────────────
  { id: 'ba-1', category: 'baking', body: 'Weigh your flour. Scooping straight from the bag packs in up to 20% more than the recipe intends — the difference between tender and tough. No scale? Fluff the flour, spoon it into the cup, and level with a knife. Never tap or press.' },
  { id: 'ba-2', category: 'baking', body: '"Room-temperature butter" means cool to the touch but yielding — press it and your finger should leave a dent without sinking in. Too soft and it cannot hold the air that creaming is supposed to whip into it, and your cookies spread flat.' },
  { id: 'ba-3', category: 'baking', body: 'Lumpy batter is happy batter. For muffins, pancakes, and quick breads, stir only until the flour disappears — every extra fold develops gluten and trades tenderness for chew. Streaks and small lumps bake out; overmixing never does.' },
  { id: 'ba-4', category: 'baking', body: 'Your oven lies. Most run 15–25°F off their dial, which is the difference between golden and scorched in a bake. A $10 oven thermometer hung from the middle rack tells you the truth — check it once and learn your oven\'s personality.' },
  { id: 'ba-5', category: 'baking', body: 'Ovens have hot spots, so rotate your pans 180° halfway through baking — and swap racks if you are baking two sheets at once. Wait until the structure is set (about two-thirds through) for delicate cakes so the rotation does not deflate them.' },
  { id: 'ba-6', category: 'baking', body: 'Chill your cookie dough — overnight if you can bear it. Resting hydrates the flour, deepens the butterscotch notes as sugars break down, and firm cold dough spreads less in the oven, giving you thick, chewy centers instead of thin, brittle discs.' },
  { id: 'ba-7', category: 'baking', body: 'Yeast is alive, and dead yeast is the silent killer of flat bread. If your packet is past its date, prove it first: stir it into warm water (about 105°F) with a pinch of sugar. Foamy in 10 minutes means go; still liquid means buy fresh yeast.' },
  { id: 'ba-8', category: 'baking', body: 'Parchment paper beats greasing nearly every time — nothing sticks, edges brown evenly, and cleanup is lifting a sheet. Cut a round for cake pans, leave an overhang in loaf pans and brownie pans, and reuse sheets for cookies until they darken.' },
```

New Produce block (after Baking):

```ts
  // ── Produce ────────────────────────────────────────────────────────────
  { id: 'pr-1', category: 'produce', body: 'To ripen an avocado fast, seal it in a paper bag with a banana — the trapped ethylene does in a day what the counter does in four. The moment it yields to gentle pressure, move it to the fridge, where it will hold at peak for several days.' },
  { id: 'pr-2', category: 'produce', body: 'Limp celery, wilted greens, and bendy carrots are dehydrated, not dead. Fifteen minutes in a bowl of ice water and they snap back to crisp. It works for herbs, lettuce, even flabby radishes — revive before you resign them to the compost.' },
  { id: 'pr-3', category: 'produce', body: 'Never wash berries until the moment you eat them — moisture is what molds them. To stretch their life, give them a 30-second bath in three parts water to one part vinegar, then dry completely. The rinse kills surface spores and adds days.' },
  { id: 'pr-4', category: 'produce', body: 'Garlic flavor is a dial, not a switch: the finer you cut, the stronger it gets. Whole cloves whisper, slices speak, minced shouts, and pressed screams. Smash a clove with the flat of your knife first and the peel slips right off.' },
  { id: 'pr-5', category: 'produce', body: 'Cold citrus is stingy citrus. Juice lemons and limes at room temperature — or give chilled fruit 20 seconds of firm rolling under your palm — and you will get noticeably more juice from the same fruit. Zest before juicing, always.' },
  { id: 'pr-6', category: 'produce', body: 'Mushrooms are sponges, so never soak them — wipe with a damp towel or give a fast rinse right before cooking. Store them in a paper bag in the fridge, not plastic: the bag breathes, the mushrooms stay dry, and slime never gets a foothold.' },
  { id: 'pr-7', category: 'produce', body: 'Keep a stock bag in the freezer: onion ends, carrot peels, celery leaves, herb stems, mushroom trimmings. When it fills, simmer it all for an hour with a bay leaf and you have free vegetable stock better than anything in a carton.' },
  { id: 'pr-8', category: 'produce', body: 'Shop the season. In-season produce is cheaper, closer, and picked riper — an August tomato and a January tomato are different foods. Off-season, canned tomatoes and frozen peas beat their fresh-but-shipped versions almost every time.' },
```

New Freezer block (after Storage):

```ts
  // ── Freezer smarts ─────────────────────────────────────────────────────
  { id: 'fz-1', category: 'freezer', body: 'Freeze flat. Soups, stews, sauces, and ground meat pressed thin in zip-top bags stack like books, freeze in half the time, and thaw in minutes under cold water instead of hours as a frozen brick.' },
  { id: 'fz-2', category: 'freezer', body: 'Portion before you freeze. Tomato paste in tablespoon dollops, stock in ice-cube trays, cookie dough in pre-scooped balls — future-you needs two cubes of stock, not a quart-sized block welded around the exact amount you wanted.' },
  { id: 'fz-3', category: 'freezer', body: 'Label everything with contents and date — painter\'s tape and a marker are all you need. Every freezer eventually grows a shelf of frost-bearded mystery containers, and unlabeled food is food you will eventually throw away unopened.' },
  { id: 'fz-4', category: 'freezer', body: 'Thaw in the fridge, not on the counter. Overnight in the fridge keeps meat cold and safe the whole way; a counter thaw leaves the outside sitting in the bacterial danger zone while the middle catches up. In a hurry, use sealed bags in cold water.' },
  { id: 'fz-5', category: 'freezer', body: 'Freezer burn is not spoilage — it is dehydration where air touched food. It is safe to eat but tastes flat and woolly. The cure is prevention: wrap tightly, press the air out of bags, and use rigid containers filled close to the top.' },
  { id: 'fz-6', category: 'freezer', body: 'Chop leftover fresh herbs, pack them into ice-cube trays, and cover with olive oil before freezing. Each cube is a ready-made flavor base — drop one into a hot pan and you have herbs and cooking fat for a weeknight sauté in one move.' },
  { id: 'fz-7', category: 'freezer', body: 'Bananas past their prime are a baking asset. Peel them first (frozen peels are miserable to remove), freeze in a bag, and you have a standing supply for banana bread and smoothies — freezing even sweetens them as the starches convert.' },
  { id: 'fz-8', category: 'freezer', body: 'Run your freezer first-in, first-out: newest to the back, oldest up front where you will grab it. A freezer is not an archive — most frozen food is at its best inside three months, so make the front row this month\'s dinners.' },
```

New Food safety block (after Freezer):

```ts
  // ── Food safety ────────────────────────────────────────────────────────
  { id: 'fs-1', category: 'safety', body: 'Give raw meat its own cutting board. Juices work into the knife scars of a board, and no quick rinse gets them out — cross-contamination onto the salad you chop next is how kitchens make people sick. Two boards, two colors, no confusion.' },
  { id: 'fs-2', category: 'safety', body: 'The danger zone is 40–140°F — bacteria double every 20 minutes there. The working rule: perishable food should not sit out longer than 2 hours (1 hour on a hot day). Buffet leftovers that lingered all afternoon are not worth the gamble.' },
  { id: 'fs-3', category: 'safety', body: 'Do not wash raw chicken. The rinse kills nothing — cooking does that — but the spray aerosolizes bacteria across your sink, faucet, and counters up to three feet away. Pat dry with paper towels, toss them, wash your hands, and cook it through.' },
  { id: 'fs-4', category: 'safety', body: 'Your fridge should hold at or below 40°F and your freezer at 0°F, and the built-in dial is not a measurement. A cheap appliance thermometer on the middle shelf tells you the truth — especially worth checking after a power flicker or a heavy grocery load.' },
  { id: 'fs-5', category: 'safety', body: 'Leftovers keep 3–4 days in the fridge — count the days, not the smell. Reheat until steaming hot throughout (165°F), not just warmed through. Soups and sauces get a full rolling boil; the microwave needs a stir halfway to kill the cold spots.' },
  { id: 'fs-6', category: 'safety', body: 'A big pot of hot soup does not go straight into the fridge — the core stays warm for hours, and it heats everything around it. Divide into shallow containers first; food cools through the danger zone in a fraction of the time, refrigerate within two hours.' },
  { id: 'fs-7', category: 'safety', body: 'When in doubt, throw it out. Smell and appearance catch spoilage bacteria, but the pathogens that cause food poisoning are invisible and odorless — food can smell perfectly fine and still make you sick. No leftover is worth two days on the couch.' },
  { id: 'fs-8', category: 'safety', body: 'Wash your hands like it matters: 20 seconds with soap, before cooking and immediately after touching raw meat, poultry, or eggs. Dry with a clean towel — the hand towel that has wiped counters all week undoes the wash.' },
```

Storage additions (after `st-5`):

```ts
  { id: 'st-6', category: 'storage', body: 'Never refrigerate a tomato that is not fully ripe — cold kills the enzymes that produce flavor and turns the flesh mealy. Ripen on the counter stem-side down (the shoulder is the sturdiest part), and only refrigerate a dead-ripe tomato you cannot eat in time.' },
  { id: 'st-7', category: 'storage', body: 'Nuts, seeds, and whole-grain flours carry oils that slowly go rancid at room temperature — that bitter, paint-like edge in old walnuts. Store what you will not use within a month in the freezer, where they keep for a year with no loss of crunch.' },
  { id: 'st-8', category: 'storage', body: 'Front-and-center is a storage strategy: keep the food that expires soonest at eye level, not buried in a drawer. Most fridge waste is not food that went bad too fast — it is food that was never seen again after the day it went in.' },
```

General additions (after `ge-5`):

```ts
  { id: 'ge-6', category: 'general', body: 'A tablespoon of table salt is nearly twice as salty as a tablespoon of Diamond Crystal kosher salt — the crystals pack differently. When a recipe names a salt, take it seriously, and when converting, halve table salt in place of kosher (or double the other way).' },
  { id: 'ge-7', category: 'general', body: 'Build a small acid shelf: red wine vinegar, rice vinegar, sherry vinegar, and a lemon or two. Different acids brighten different dishes — rice vinegar for gentle, sherry for deep and nutty — and a finishing splash wakes up more dishes than more salt does.' },
  { id: 'ge-8', category: 'general', body: 'Cook once, eat twice. Doubling rice, roasted vegetables, or a pot of beans costs five extra minutes tonight and saves thirty tomorrow — tomorrow\'s fried rice, grain bowl, or soup is already half-made. Leftover components beat leftover meals.' },
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `packages/core/`): `npm test -- tips`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/tips.ts packages/core/src/tips.test.ts
git commit -m "feat(tips): 4 new categories and 46 new tips with library validation"
```

---

### Task 2: `tipOfTheDay` (core)

Deterministic date-hash pick, pure function beside the data.

**Files:**
- Modify: `packages/core/src/tips.ts` (append function)
- Modify: `packages/core/src/tips.test.ts` (append suite)
- Check: `packages/core/src/index.ts` — if exports are named per-module, add `tipOfTheDay` (and confirm `KITCHEN_TIPS`, `TIP_CATEGORY_META`, `TIP_CATEGORY_ORDER`, `TipCategory`, `Tip` are already exported — TipsScreen imports them today, so they are).

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/tips.test.ts`:

```ts
import { tipOfTheDay } from './tips';

describe('tipOfTheDay', () => {
  it('is deterministic for a given date', () => {
    expect(tipOfTheDay('2026-07-17')).toEqual(tipOfTheDay('2026-07-17'));
    expect(tipOfTheDay('2026-07-17T09:30:00.000Z')).toEqual(tipOfTheDay('2026-07-17T23:59:00.000Z'));
  });

  it('varies across a 30-day window (multiple tips and categories)', () => {
    const seen = new Set<string>();
    const cats = new Set<string>();
    for (let d = 1; d <= 30; d++) {
      const tip = tipOfTheDay(`2026-06-${String(d).padStart(2, '0')}`);
      seen.add(tip.id);
      cats.add(tip.category);
    }
    expect(seen.size).toBeGreaterThanOrEqual(10);
    expect(cats.size).toBeGreaterThanOrEqual(3);
  });

  it('never throws, even on odd input', () => {
    expect(() => tipOfTheDay('')).not.toThrow();
    expect(() => tipOfTheDay('not-a-date')).not.toThrow();
    expect(KITCHEN_TIPS).toContainEqual(tipOfTheDay(''));
  });
});
```

(`KITCHEN_TIPS` is already imported at the top of the file; merge the `tipOfTheDay` import into that existing import statement rather than adding a duplicate.)

- [ ] **Step 2: Run to verify failure**

Run (from `packages/core/`): `npm test -- tips`
Expected: FAIL — `tipOfTheDay` is not exported.

- [ ] **Step 3: Implement in `packages/core/src/tips.ts`**

Append after `KITCHEN_TIPS`:

```ts
/**
 * Deterministic daily pick: hash the YYYY-MM-DD prefix (djb2) into the tip
 * list. Same date → same tip on every device; consecutive dates scatter
 * across the library. Time-of-day and timezone suffixes are ignored.
 */
export function tipOfTheDay(dateISO: string): Tip {
  const day = dateISO.slice(0, 10);
  let h = 5381;
  for (let i = 0; i < day.length; i++) {
    h = (h * 33 + day.charCodeAt(i)) >>> 0;
  }
  return KITCHEN_TIPS[h % KITCHEN_TIPS.length];
}
```

- [ ] **Step 4: Run to verify pass**

Run (from `packages/core/`): `npm test -- tips`
Expected: PASS (8 tests). If the 30-day variance case fails (hash clustering), bump the hash to include `day.length` seed changes — but djb2 over distinct date strings will pass.

- [ ] **Step 5: Run the whole core suite**

Run (from `packages/core/`): `npm test`
Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/tips.ts packages/core/src/tips.test.ts packages/core/src/index.ts
git commit -m "feat(tips): deterministic tipOfTheDay"
```

(Include `index.ts` only if it needed an export addition.)

---

### Task 3: `useSavedTips` hook (mobile, device-local favorites)

AsyncStorage-backed per-user saved-tip ids, mirroring `useQuickAddConfig` (`apps/mobile/src/features/pantry/useQuickAddConfig.ts`). Jest is already set up with the AsyncStorage mock (`apps/mobile/jest.setup.js`); the test style follows `useTasteProfile.test.tsx`.

**Files:**
- Create: `apps/mobile/src/features/tips/useSavedTips.ts`
- Create: `apps/mobile/src/features/tips/useSavedTips.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/tips/useSavedTips.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSavedTips } from './useSavedTips';

describe('useSavedTips', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('starts empty for a fresh user', async () => {
    const { result } = renderHook(() => useSavedTips('user-1'));
    await waitFor(() => expect(result.current.savedIds).toEqual([]));
  });

  it('loads previously saved ids for the user', async () => {
    await AsyncStorage.setItem('savedTips:user-1', JSON.stringify(['cw-1', 'ba-3']));
    const { result } = renderHook(() => useSavedTips('user-1'));
    await waitFor(() => expect(result.current.savedIds).toEqual(['cw-1', 'ba-3']));
  });

  it('toggle adds then removes, and persists', async () => {
    const { result } = renderHook(() => useSavedTips('user-1'));
    await waitFor(() => expect(result.current.savedIds).toEqual([]));

    act(() => result.current.toggle('te-2'));
    expect(result.current.savedIds).toEqual(['te-2']);
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem('savedTips:user-1')) ?? '[]')).toEqual(['te-2']),
    );

    act(() => result.current.toggle('te-2'));
    expect(result.current.savedIds).toEqual([]);
  });

  it('falls back to empty on corrupt storage', async () => {
    await AsyncStorage.setItem('savedTips:user-1', 'not json');
    const { result } = renderHook(() => useSavedTips('user-1'));
    await waitFor(() => expect(result.current.savedIds).toEqual([]));
  });

  it('null user: empty and never writes', async () => {
    const { result } = renderHook(() => useSavedTips(null));
    await waitFor(() => expect(result.current.savedIds).toEqual([]));
    act(() => result.current.toggle('cw-1'));
    expect(result.current.savedIds).toEqual(['cw-1']); // in-memory only this session
    expect(await AsyncStorage.getItem('savedTips:null')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (from `apps/mobile/`): `npm test -- useSavedTips`
Expected: FAIL — cannot resolve `./useSavedTips`.

- [ ] **Step 3: Implement the hook**

Create `apps/mobile/src/features/tips/useSavedTips.ts`:

```ts
/**
 * useSavedTips — per-user bookmarked kitchen tips, persisted on-device
 * (AsyncStorage, same pattern as useQuickAddConfig). Display preference only,
 * so it doesn't sync; a null userId keeps toggles in-memory for the session.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const storageKey = (userId: string) => `savedTips:${userId}`;

export function useSavedTips(userId: string | null) {
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setSavedIds([]);
      return;
    }
    AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (cancelled) return;
        try {
          const parsed: unknown = raw ? JSON.parse(raw) : [];
          setSavedIds(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
        } catch {
          setSavedIds([]);
        }
      })
      .catch(() => {
        if (!cancelled) setSavedIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = useCallback(
    (id: string) => {
      setSavedIds((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        if (userId) AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [userId],
  );

  return { savedIds, toggle };
}
```

- [ ] **Step 4: Run to verify pass**

Run (from `apps/mobile/`): `npm test -- useSavedTips`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/tips/useSavedTips.ts apps/mobile/src/features/tips/useSavedTips.test.tsx
git commit -m "feat(tips): device-local saved tips hook"
```

---

### Task 4: `ListRow` icon slot + tip art mapping

Two small independent pieces the screens need: a backward-compatible leading-icon slot on `ListRow`, and the per-category icon/tone mapping.

**Files:**
- Modify: `apps/mobile/src/components/ui.tsx` (`ListRow` ~line 135; styles ~line 188)
- Create: `apps/mobile/src/features/tips/tipArt.tsx`

- [ ] **Step 1: Extend `ListRow`**

Replace the current `ListRow` (label sits directly in a space-between row) with a left-group wrapper so an optional icon can precede the label:

```tsx
export function ListRow({ label, value, icon, onPress }: { label: string; value?: string; icon?: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.listRow, pressed && onPress ? styles.listRowPressed : null]}
    >
      <View style={styles.listRowLeft}>
        {icon ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{icon}</View> : null}
        <Text style={styles.listRowLabel}>{label}</Text>
      </View>
      <View style={styles.listRowRight}>
        {value ? <Text style={styles.listRowValue}>{value}</Text> : null}
        {onPress ? <Text style={styles.listRowChevron}>›</Text> : null}
      </View>
    </Pressable>
  );
}
```

Add to the StyleSheet (next to `listRowRight`):

```ts
  listRowLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3), flexShrink: 1 },
```

No `icon` prop → identical render to today (empty left group wraps only the label). Existing callers untouched.

- [ ] **Step 2: Create the tip art mapping**

Create `apps/mobile/src/features/tips/tipArt.tsx`:

```tsx
/**
 * tipArt — tip category → lucide icon + brand tone, one entry per category
 * (Record type keeps it complete as categories grow). Lives beside the Tips
 * screen but separate so art changes never touch tip data (the stapleArt
 * pattern). Icons render 16px inside a soft-toned chip on tip cards.
 */
import type { ComponentType } from 'react';
import {
  Apple,
  Archive,
  Carrot,
  ChefHat,
  CookingPot,
  Croissant,
  Lightbulb,
  ShieldCheck,
  Snowflake,
} from 'lucide-react-native';

import type { TipCategory } from '@breadbox/core';
import { toneHex, type BrandTone } from '../../theme/brandPalette';

interface TipArt {
  Icon: ComponentType<{ size?: number; color?: string }>;
  tone: BrandTone;
}

export const TIP_ART: Record<TipCategory, TipArt> = {
  cookware: { Icon: CookingPot, tone: 'spruce' },
  ingredients: { Icon: Carrot, tone: 'terracotta' },
  technique: { Icon: ChefHat, tone: 'cocoa' },
  baking: { Icon: Croissant, tone: 'ochre' },
  produce: { Icon: Apple, tone: 'fern' },
  storage: { Icon: Archive, tone: 'blue' },
  freezer: { Icon: Snowflake, tone: 'blue' },
  safety: { Icon: ShieldCheck, tone: 'brick' },
  general: { Icon: Lightbulb, tone: 'plum' },
};

/** Soft chip background for a category (tone at low alpha over the surface). */
export function tipToneSoft(cat: TipCategory): string {
  return toneHex(TIP_ART[cat].tone) + '22';
}

export function tipTone(cat: TipCategory): string {
  return toneHex(TIP_ART[cat].tone);
}
```

Before committing, open `apps/mobile/src/theme/brandPalette.ts` and confirm `toneHex` returns 6-digit `#RRGGBB` hex (the `+ '22'` alpha suffix relies on it); if it returns anything else, compute the soft background with an explicit map instead. Also confirm the `freezer`/`storage` double-`blue` doesn't collide visually in QA — tones may repeat (staple art repeats tones freely).

- [ ] **Step 3: Typecheck**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/ui.tsx apps/mobile/src/features/tips/tipArt.tsx
git commit -m "feat(ui): ListRow icon slot + tip category art mapping"
```

---

### Task 5: TipsScreen rebuild

Featured tip-of-the-day card, Saved chip pinned before the categories, per-category toned card icons, bookmark toggles.

**Files:**
- Modify: `apps/mobile/src/features/tips/TipsScreen.tsx` (full replacement below)

- [ ] **Step 1: Replace `TipsScreen.tsx` with:**

```tsx
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bookmark, Lightbulb } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import { Screen } from '../../components/ui';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  KITCHEN_TIPS,
  TIP_CATEGORY_META,
  TIP_CATEGORY_ORDER,
  tipOfTheDay,
  type Tip,
  type TipCategory,
} from '@breadbox/core';
import { useAuth } from '../auth/AuthContext';
import { useSavedTips } from './useSavedTips';
import { TIP_ART, tipTone, tipToneSoft } from './tipArt';

/** 'saved' is a pseudo-category pinned before the real ones. */
type TipFilter = TipCategory | 'saved';

export function TipsScreen() {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.session.user.id : null;
  const { savedIds, toggle } = useSavedTips(userId);
  const [selected, setSelected] = useState<TipFilter>('cookware');

  const daily = useMemo(() => tipOfTheDay(new Date().toISOString()), []);

  const tips = useMemo(
    () =>
      selected === 'saved'
        ? KITCHEN_TIPS.filter((t) => savedIds.includes(t.id))
        : KITCHEN_TIPS.filter((t) => t.category === selected),
    [selected, savedIds],
  );

  return (
    <Screen>
      <ScreenHeader title="Kitchen tips" />
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {/* Tip of the day — same pick as the Settings teaser (tipOfTheDay is deterministic). */}
        <View style={styles.daily}>
          <View style={styles.dailyHead}>
            <Lightbulb size={16} color={tokens.color.accent} />
            <Text style={styles.dailyCaption}>Tip of the day</Text>
          </View>
          <Text style={styles.dailyBody}>{daily.body}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
          style={styles.categoryScroll}
        >
          {(['saved', ...TIP_CATEGORY_ORDER] as TipFilter[]).map((cat) => {
            const active = cat === selected;
            const label = cat === 'saved' ? 'Saved' : TIP_CATEGORY_META[cat].label;
            return (
              <Pressable
                key={cat}
                onPress={() => setSelected(cat)}
                style={[styles.chip, active && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {selected === 'saved' && tips.length === 0 ? (
          <Text style={styles.savedEmpty}>Nothing saved yet — tap the bookmark on any tip.</Text>
        ) : (
          tips.map((tip) => (
            <TipCard key={tip.id} tip={tip} saved={savedIds.includes(tip.id)} onToggle={() => toggle(tip.id)} />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function TipCard({ tip, saved, onToggle }: { tip: Tip; saved: boolean; onToggle: () => void }) {
  const { Icon } = TIP_ART[tip.category];
  return (
    <View style={styles.card}>
      <View style={[styles.cardIcon, { backgroundColor: tipToneSoft(tip.category) }]}>
        <Icon size={16} color={tipTone(tip.category)} />
      </View>
      <Text style={styles.cardBody}>{tip.body}</Text>
      <Pressable
        onPress={onToggle}
        hitSlop={12}
        style={styles.bookmark}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={saved ? 'Remove from saved' : 'Save tip'}
      >
        <Bookmark
          size={16}
          color={saved ? tokens.color.accent : tokens.color.inkMuted}
          fill={saved ? tokens.color.accent : 'none'}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: tokens.space(6),
    paddingBottom: tokens.space(10),
    gap: tokens.space(2),
  },
  daily: {
    backgroundColor: tokens.color.accentSoft,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
    gap: tokens.space(2),
    marginBottom: tokens.space(2),
  },
  dailyHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2) },
  dailyCaption: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.accent,
  },
  dailyBody: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.ink,
    lineHeight: 20,
  },
  categoryScroll: { flexGrow: 0, marginHorizontal: -tokens.space(6), marginBottom: tokens.space(2) },
  categoryRow: {
    flexDirection: 'row',
    gap: tokens.space(2),
    paddingHorizontal: tokens.space(6),
    paddingVertical: tokens.space(2),
  },
  chip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  chipSelected: { backgroundColor: tokens.color.accent },
  chipText: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.ink,
    lineHeight: 18,
  },
  chipTextSelected: { color: tokens.color.onAccent },
  savedEmpty: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    paddingVertical: tokens.space(8),
  },
  card: {
    flexDirection: 'row',
    gap: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  cardBody: {
    flex: 1,
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.ink,
    lineHeight: 20,
  },
  bookmark: { marginTop: 1, padding: 2 },
});
```

Notes for the implementer:
- The old screen's unused `useNavigation`/`RootStackParamList` imports are gone on purpose (the screen never navigated).
- The chips moved INSIDE the vertical ScrollView (under the featured card) — the negative `marginHorizontal` + matching `paddingHorizontal` keeps chips scrolling edge-to-edge while the list stays padded.
- Check `useAuth`'s state shape against `apps/mobile/src/features/auth/AuthContext.tsx` — SettingsScreen reads `state.session.user.email` when `state.status === 'authenticated'`, so `state.session.user.id` is available the same way.
- Check `tokens.color.accentSoft` exists (SettingsScreen-adjacent screens use it; TipsScreen's old `cardIcon` used it too — it does).

- [ ] **Step 2: Typecheck + full mobile suite**

Run (from `apps/mobile/`): `npx tsc --noEmit && npm test`
Expected: no type errors; all suites PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/tips/TipsScreen.tsx
git commit -m "feat(tips): tip of the day, saved filter, and category-toned cards"
```

---

### Task 6: SettingsScreen grouping + icons + tips teaser

Group the nav rows under Explore/Manage captions with muted icons; replace the "Kitchen tips" row with a tip-of-the-day teaser card.

**Files:**
- Modify: `apps/mobile/src/features/settings/SettingsScreen.tsx`

- [ ] **Step 1: Add imports**

Extend the existing import block:

```tsx
import { BookOpen, CalendarCheck, Clock, Flame, LayoutGrid, Lightbulb, Store, Users } from 'lucide-react-native';
import { suggestDateRepairs, tipOfTheDay } from '@breadbox/core';
```

(`suggestDateRepairs` is already imported — merge, don't duplicate.) Also add `Caption` — it is already imported from `../../components/ui`.

- [ ] **Step 2: Compute the daily tip**

Inside `SettingsScreen()`, next to the `repairCount` memo:

```tsx
  const dailyTip = useMemo(() => tipOfTheDay(new Date().toISOString()), []);
```

- [ ] **Step 3: Replace the flat row list**

Replace the block from `<ListRow label="Your impact" …` through `<ListRow label="Kitchen tips" … />` (currently lines ~165–180) with:

```tsx
          <View style={styles.section}>
            <Caption>Explore</Caption>
            <View style={styles.rowGroup}>
              <ListRow
                icon={<Flame size={16} color={tokens.color.inkMuted} />}
                label="Your impact"
                value={insights.streakDays > 0 ? `🔥 ${insights.streakDays}d` : undefined}
                onPress={() => navigation.navigate('Insights')}
              />
              <ListRow
                icon={<LayoutGrid size={16} color={tokens.color.inkMuted} />}
                label="Collections"
                onPress={() => navigation.navigate('Collections')}
              />
              <ListRow
                icon={<BookOpen size={16} color={tokens.color.inkMuted} />}
                label="Cookbook"
                onPress={() => navigation.navigate('Cookbook')}
              />
              <ListRow
                icon={<Clock size={16} color={tokens.color.inkMuted} />}
                label="History"
                onPress={() => navigation.navigate('History')}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Caption>Manage</Caption>
            <View style={styles.rowGroup}>
              <ListRow
                icon={<Store size={16} color={tokens.color.inkMuted} />}
                label="Your stores"
                onPress={() => navigation.navigate('FavoriteStores')}
              />
              <ListRow
                icon={<CalendarCheck size={16} color={tokens.color.inkMuted} />}
                label="Review expiry dates"
                value={repairCount > 0 ? `${repairCount} to fix` : undefined}
                onPress={() => navigation.navigate('ReviewDates')}
              />
              <ListRow
                icon={<Users size={16} color={tokens.color.inkMuted} />}
                label="Household"
                onPress={() => navigation.navigate('Household')}
              />
            </View>
          </View>

          {/* Tip of the day teaser — same deterministic pick as the Tips screen. */}
          <Pressable
            onPress={() => navigation.navigate('Tips')}
            style={({ pressed }) => [styles.tipTeaser, pressed && styles.tipTeaserPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Tip of the day: ${dailyTip.body}`}
          >
            <View style={styles.tipTeaserIcon}>
              <Lightbulb size={16} color={tokens.color.accent} />
            </View>
            <View style={styles.tipTeaserBody}>
              <Text style={styles.tipTeaserCaption}>Tip of the day</Text>
              <Text style={styles.tipTeaserText} numberOfLines={1} ellipsizeMode="tail">
                {dailyTip.body}
              </Text>
            </View>
            <Text style={styles.tipTeaserChevron}>›</Text>
          </Pressable>
```

The `FavoriteStores` route name must match the current row's `navigation.navigate('FavoriteStores')` — it does today; copy whatever the existing row uses if it differs.

- [ ] **Step 4: Add styles**

Add to the StyleSheet:

```ts
  rowGroup: { gap: tokens.space(2), marginTop: tokens.space(1) },
  tipTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    backgroundColor: tokens.color.accentSoft,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
  },
  tipTeaserPressed: { opacity: 0.7 },
  tipTeaserIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTeaserBody: { flex: 1, gap: 2 },
  tipTeaserCaption: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.accent,
  },
  tipTeaserText: { fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.ink },
  tipTeaserChevron: { fontFamily: tokens.font.body.regular, fontSize: 22, color: tokens.color.inkMuted },
```

Also reduce `topGroup`'s gap crowding: the grouped sections carry their own internal spacing, so leave `topGroup: { gap: tokens.space(6) }` as-is (sections + teaser are its direct children — the rhythm matches the Name/Account/Reminder sections above).

- [ ] **Step 5: Typecheck + full mobile suite**

Run (from `apps/mobile/`): `npx tsc --noEmit && npm test`
Expected: no type errors; all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/settings/SettingsScreen.tsx
git commit -m "feat(settings): grouped iconed rows and tip-of-the-day teaser"
```

---

### Task 7: Full verification

- [ ] **Step 1: Core suite** — Run (from `packages/core/`): `npm test` → all PASS.
- [ ] **Step 2: Mobile suite** — Run (from `apps/mobile/`): `npm test` → all PASS.
- [ ] **Step 3: Typecheck** — Run (from `apps/mobile/`): `npx tsc --noEmit` → clean.
- [ ] **Step 4: Lint** — Run (from repo root): `npm run lint` → 0 errors (pre-existing warnings OK; none introduced in touched files).
- [ ] **Step 5: On-device / simulator QA**
  - Tips: featured card shows today's tip; 10 chips (Saved + 9 categories) scroll edge-to-edge; each category lists 8 tips with its toned icon; bookmark toggles fill/unfill and survive an app restart; Saved filter lists bookmarks, empty state reads right.
  - Settings: Explore/Manage captions with muted row icons; teaser card shows the same tip as the Tips screen's featured card and navigates to Tips; sign-out/delete/build line unchanged; small-phone scroll still reaches the footer.
- [ ] **Step 6: Hand off** — branch `feat/settings-tips-expansion`; PR after user QA.

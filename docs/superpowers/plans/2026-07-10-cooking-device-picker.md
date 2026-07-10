# "Cooking With" Device Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Cook tab asks "What are you cooking with tonight?" once a day; the answer (multi-select: stove, oven, crockpot, air fryer, grill, griddle) soft-boosts matching recipes in the ranking and explains itself with a card badge.

**Architecture:** A new pure scoring module in `@breadbox/core` (keyword detection over recipe title + per-step equipment, flat +5 boost, badge formatter) — the exact pattern of `useItUp.ts`. A small AsyncStorage hook persists tonight's choice under a date-keyed key so it resets at midnight. `RecipesScreen.tsx` renders the prompt card + chip row and adds one term to its existing ranking blend. No API/server changes, no refetches — pure client-side re-ranking.

**Tech Stack:** TypeScript, Vitest (`packages/core`), React Native + AsyncStorage (`apps/mobile`), existing `@breadbox/core` workspace import.

**Spec:** `docs/superpowers/specs/2026-07-10-cooking-device-picker-design.md`

**Reference files (read before starting):**
- `packages/core/src/useItUp.ts` + `useItUp.test.ts` — the pattern this module copies
- `apps/mobile/src/features/recipes/useRecipePrefs.ts` — the AsyncStorage hook pattern
- `apps/mobile/src/features/recipes/RecipesScreen.tsx` — the Cook tab being modified

---

### Task 1: Core module `cookingDevice.ts` (detection + boost + badge)

**Files:**
- Create: `packages/core/src/cookingDevice.ts`
- Create: `packages/core/src/cookingDevice.test.ts`
- Modify: `packages/core/src/index.ts` (add export)

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/cookingDevice.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  COOKING_DEVICES,
  DEVICE_BOOST,
  detectDevices,
  formatDeviceBadge,
  scoreDeviceBoost,
  type CookingDevice,
} from "./cookingDevice.ts";

describe("detectDevices", () => {
  it("detects every device from a title keyword alone", () => {
    expect(detectDevices("Chicken Stir-Fry in a Wok", [])).toContain("stove");
    expect(detectDevices("Sheet Pan Salmon", [])).toContain("oven");
    expect(detectDevices("Slow Cooker Pulled Pork", [])).toContain("crockpot");
    expect(detectDevices("Crispy Air Fryer Wings", [])).toContain("airfryer");
    expect(detectDevices("Grilled Corn Salad", [])).toContain("grill");
    expect(detectDevices("Griddle Smash Burgers", [])).toContain("griddle");
  });

  it("detects from equipment strings when the title is silent", () => {
    expect(detectDevices("Shrimp Scampi", ["large skillet"])).toContain("stove");
    expect(detectDevices("Weeknight Casserole", ["baking dish"])).toContain("oven");
    expect(detectDevices("Sunday Chili", ["slow cooker"])).toContain("crockpot");
  });

  it("keyword matching is case-insensitive", () => {
    expect(detectDevices("BBQ Ribs", [])).toContain("grill");
    expect(detectDevices("dinner", ["Air Fryer basket"])).toContain("airfryer");
  });

  it("'dutch oven' reads as stove, not oven", () => {
    const detected = detectDevices("Dutch Oven Braised Beef", []);
    expect(detected).toContain("stove");
    expect(detected).not.toContain("oven");
  });

  it("'grill pan' reads as stove, not grill", () => {
    const detected = detectDevices("Steak Night", ["grill pan"]);
    expect(detected).toContain("stove");
    expect(detected).not.toContain("grill");
  });

  it("a recipe can match multiple devices", () => {
    const detected = detectDevices("Grilled Chicken with Skillet Corn", []);
    expect(detected).toContain("grill");
    expect(detected).toContain("stove");
  });

  it("returns an empty set when nothing matches", () => {
    expect(detectDevices("Fruit Salad", ["mixing bowl"]).size).toBe(0);
  });
});

describe("scoreDeviceBoost", () => {
  const detected = new Set<CookingDevice>(["grill"]);

  it("returns the flat boost when any selected device is detected", () => {
    expect(scoreDeviceBoost(["grill"], detected)).toBe(DEVICE_BOOST);
    expect(scoreDeviceBoost(["stove", "grill"], detected)).toBe(DEVICE_BOOST);
  });

  it("is flat, not summed, when several selected devices match", () => {
    const multi = new Set<CookingDevice>(["grill", "stove"]);
    expect(scoreDeviceBoost(["grill", "stove"], multi)).toBe(DEVICE_BOOST);
  });

  it("returns 0 with an empty selection ('Anything')", () => {
    expect(scoreDeviceBoost([], detected)).toBe(0);
  });

  it("returns 0 when no selected device was detected", () => {
    expect(scoreDeviceBoost(["crockpot"], detected)).toBe(0);
  });
});

describe("formatDeviceBadge", () => {
  it("names the first selected device that matched", () => {
    const detected = new Set<CookingDevice>(["stove", "grill"]);
    expect(formatDeviceBadge(["grill", "stove"], detected)).toBe("Grill pick");
    expect(formatDeviceBadge(["airfryer", "stove"], detected)).toBe("Stovetop pick");
  });

  it("uses each device's badge label", () => {
    for (const d of COOKING_DEVICES) {
      expect(formatDeviceBadge([d.id], new Set([d.id]))).toMatch(/ pick$/);
    }
    expect(formatDeviceBadge(["crockpot"], new Set<CookingDevice>(["crockpot"]))).toBe("Crockpot pick");
    expect(formatDeviceBadge(["airfryer"], new Set<CookingDevice>(["airfryer"]))).toBe("Air fryer pick");
  });

  it("returns null when nothing matched or nothing is selected", () => {
    expect(formatDeviceBadge(["grill"], new Set())).toBeNull();
    expect(formatDeviceBadge([], new Set<CookingDevice>(["grill"]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace @breadbox/core -- cookingDevice`
(The workspace script is `vitest run`; the extra arg filters to this test file.)
Expected: FAIL — cannot resolve `./cookingDevice.ts` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/cookingDevice.ts`:

```ts
/**
 * "Cooking with" — tonight's-device detection and soft ranking boost. Pure
 * functions, no I/O — same pattern as useItUp.ts.
 *
 * The Cook tab asks what the user is cooking ON tonight (crockpot, grill, …)
 * and folds a flat boost into its ranking blend for recipes that evidently
 * use a selected device. Detection is keyword matching over the recipe title
 * plus the per-step `equipment` strings that both curated and Spoonacular
 * recipes carry. Soft boost only: non-matching recipes are never penalized
 * or hidden.
 */

export type CookingDevice =
  | "stove"
  | "oven"
  | "crockpot"
  | "airfryer"
  | "grill"
  | "griddle";

export interface CookingDeviceDef {
  id: CookingDevice;
  /** Chip label in the picker UI. */
  label: string;
  /** Short name for the card badge ("Crockpot pick"). */
  badgeLabel: string;
  /** Lowercase phrases matched (substring) against title + equipment. */
  keywords: string[];
}

/** Display order for the prompt card and chip row. */
export const COOKING_DEVICES: CookingDeviceDef[] = [
  {
    id: "stove",
    label: "Stove / pan",
    badgeLabel: "Stovetop",
    keywords: [
      "skillet", "saucepan", "sauté pan", "saute pan", "frying pan",
      "stovetop", "stove", "wok", "pan-fried", "pan-seared",
    ],
  },
  {
    id: "oven",
    label: "Oven",
    badgeLabel: "Oven",
    keywords: [
      "oven", "baking sheet", "sheet pan", "baking dish", "roasting pan",
      "casserole dish", "baked", "roasted",
    ],
  },
  {
    id: "crockpot",
    label: "Crockpot",
    badgeLabel: "Crockpot",
    keywords: ["slow cooker", "slow-cooker", "crock pot", "crockpot", "slow-cooked"],
  },
  {
    id: "airfryer",
    label: "Air fryer",
    badgeLabel: "Air fryer",
    keywords: ["air fryer", "air-fryer", "air fried", "air-fried"],
  },
  {
    id: "grill",
    label: "Grill",
    badgeLabel: "Grill",
    keywords: ["grill", "grilled", "barbecue", "bbq"],
  },
  {
    id: "griddle",
    label: "Griddle",
    badgeLabel: "Griddle",
    keywords: ["griddle", "flat top", "flat-top", "plancha"],
  },
];

/**
 * Flat rank boost when tonight's selection matches — sized to sit beside the
 * use-it-up cap (6) without drowning the taste signal.
 */
export const DEVICE_BOOST = 5;

// Phrases that contain another device's keyword but actually mean stovetop
// cooking. Masked out of the haystack before matching; counted as stove.
const STOVE_EXCEPTIONS = ["dutch oven", "grill pan"];

/** Devices a recipe evidently uses, from its title + per-step equipment. */
export function detectDevices(title: string, equipment: string[]): Set<CookingDevice> {
  let haystack = [title, ...equipment].join(" | ").toLowerCase();
  const detected = new Set<CookingDevice>();
  for (const phrase of STOVE_EXCEPTIONS) {
    if (haystack.includes(phrase)) {
      detected.add("stove");
      haystack = haystack.split(phrase).join(" ");
    }
  }
  for (const device of COOKING_DEVICES) {
    if (device.keywords.some((k) => haystack.includes(k))) detected.add(device.id);
  }
  return detected;
}

/** +DEVICE_BOOST when any selected device was detected, else 0. Flat, never summed. */
export function scoreDeviceBoost(
  selected: CookingDevice[],
  detected: Set<CookingDevice>,
): number {
  return selected.some((d) => detected.has(d)) ? DEVICE_BOOST : 0;
}

/**
 * Card badge naming the first selected device that matched, e.g. "Grill pick".
 * Null when nothing is selected or nothing matched — badge and boost always
 * appear together.
 */
export function formatDeviceBadge(
  selected: CookingDevice[],
  detected: Set<CookingDevice>,
): string | null {
  const hit = selected.find((d) => detected.has(d));
  if (!hit) return null;
  const def = COOKING_DEVICES.find((d) => d.id === hit);
  return def ? `${def.badgeLabel} pick` : null;
}
```

- [ ] **Step 4: Export from the core index**

In `packages/core/src/index.ts`, add after the `useItUp.ts` line:

```ts
export * from "./cookingDevice.ts";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test --workspace @breadbox/core -- cookingDevice`
Expected: PASS (all tests green).

Then run the whole core suite to catch export collisions:
Run: `npm test --workspace @breadbox/core`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck` (repo root)
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/cookingDevice.ts packages/core/src/cookingDevice.test.ts packages/core/src/index.ts
git commit -m "feat(core): cookingDevice — tonight's-device detection, flat rank boost, badge"
```

---

### Task 2: `useTonightDevices` hook (per-day AsyncStorage persistence)

**Files:**
- Create: `apps/mobile/src/features/recipes/useTonightDevices.ts`

No unit test — jest-expo isn't set up for hook tests in this repo; hooks like `useRecipePrefs` are verified through app runs. The logic worth testing lives in core (Task 1).

- [ ] **Step 1: Write the hook**

Create `apps/mobile/src/features/recipes/useTonightDevices.ts`:

```ts
/**
 * useTonightDevices — the Cook tab's per-day "what are you cooking with?"
 * answer. AsyncStorage key includes the local date, so the choice expires
 * naturally at midnight and the prompt re-asks next day — no cleanup job.
 *
 * `answered` distinguishes "hasn't been asked today" from "answered with
 * Anything" (devices: []) — both rank identically, but only the former shows
 * the prompt card. A persistent tab can sit mounted across midnight, so the
 * screen calls refreshDay() on focus; a date roll resets to unanswered.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CookingDevice } from '@breadbox/core';

type Stored = { devices: CookingDevice[]; answered: boolean };

function localDay(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const storageKey = (householdId: string, day: string) => `cookingWith:${householdId}:${day}`;

export function useTonightDevices(householdId: string | null) {
  const [devices, setDevicesState] = useState<CookingDevice[]>([]);
  const [answered, setAnswered] = useState(false);
  const [day, setDay] = useState(localDay);

  useEffect(() => {
    let cancelled = false;
    setDevicesState([]);
    setAnswered(false);
    if (!householdId) return;
    AsyncStorage.getItem(storageKey(householdId, day))
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw) as Stored;
          setDevicesState(Array.isArray(parsed.devices) ? parsed.devices : []);
          setAnswered(parsed.answered === true);
        } catch {
          // Corrupt value — treat as unanswered; next answer overwrites it.
        }
      })
      .catch(() => {});
    // Best-effort tidy-up of yesterday's key.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    AsyncStorage.removeItem(storageKey(householdId, localDay(yesterday))).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [householdId, day]);

  /** Set tonight's devices ([] = "Anything") and mark today answered. */
  const setDevices = useCallback(
    (next: CookingDevice[]) => {
      setDevicesState(next);
      setAnswered(true);
      if (householdId) {
        AsyncStorage.setItem(
          storageKey(householdId, localDay()),
          JSON.stringify({ devices: next, answered: true } satisfies Stored),
        ).catch(() => {});
      }
    },
    [householdId],
  );

  /** Dismissing the prompt = "Anything" — don't re-ask today. */
  const dismiss = useCallback(() => setDevices([]), [setDevices]);

  /** Call on tab focus: rolls `day` past midnight, which resets + reloads. */
  const refreshDay = useCallback(() => setDay(localDay()), []);

  return { devices, answered, setDevices, dismiss, refreshDay };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` (repo root)
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/recipes/useTonightDevices.ts
git commit -m "feat(cook): useTonightDevices — per-day cooking-device choice, date-keyed storage"
```

---

### Task 3: Ranking boost + card badges in `RecipesScreen.tsx`

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx`

This task wires the score in and threads the badge to cards. UI for picking devices comes in Task 4 — until then `tonightDevices` is passed as `[]`, which makes every change a no-op (safe intermediate commit).

- [ ] **Step 1: Extend the core import**

In the `@breadbox/core` import block (~line 64), add:

```ts
  detectDevices,
  formatDeviceBadge,
  scoreDeviceBoost,
  type CookingDevice,
```

(alphabetical placement within the existing braces).

- [ ] **Step 2: Thread `tonightDevices` into `CookThis`**

`CookThis` props (both the destructuring and the type, ~line 600):

```ts
  tonightDevices: CookingDevice[];
```

At the `<CookThis …>` call site (~line 475), pass `tonightDevices={[]}` for now (Task 4 replaces it with the real state).

- [ ] **Step 3: Add the detection memo inside `CookThis`**

Directly below the `useItUpByRecipe` memo (~line 656):

```ts
  // "Cooking with": tonight's-device boost + badge. Keyword detection over
  // title + per-step equipment, memoized per fetched page. Empty selection
  // (or "Anything") short-circuits to an empty map — ranking unchanged.
  const deviceByRecipe = useMemo(() => {
    const map = new Map<number, { boost: number; badge: string | null }>();
    if (tonightDevices.length === 0) return map;
    for (const r of recipes) {
      const detected = detectDevices(
        r.title,
        r.instructions.flatMap((g) => g.steps.flatMap((s) => s.equipment)),
      );
      const boost = scoreDeviceBoost(tonightDevices, detected);
      if (boost > 0) map.set(r.id, { boost, badge: formatDeviceBadge(tonightDevices, detected) });
    }
    return map;
  }, [recipes, tonightDevices]);
```

- [ ] **Step 4: Add the blend term**

In the `pool` memo's `blend` (~line 694), after the `useItUpByRecipe` line:

```ts
      (deviceByRecipe.get(r.id)?.boost ?? 0) +
```

and add `deviceByRecipe` to the `pool` memo's dependency array.

- [ ] **Step 5: Thread the badge to `RecipeRow` and `HeroCard`**

`RecipeRow`: add prop `deviceBadge: string | null` (both destructuring and type). Render after the `useItUp` badge block (~line 207):

```tsx
        {deviceBadge && (
          <Text style={styles.deviceBadge} numberOfLines={1}>
            {deviceBadge}
          </Text>
        )}
```

`HeroCard`: same prop, same render after its `useItUp` badge block (~line 988).

Update every call site:
- `HeroCard` render (~line 823): `deviceBadge={deviceByRecipe.get(item.id)?.badge ?? null}`
- Both `RecipeRow` usages — suggestions (~line 853) and alternates (~line 862): `deviceBadge={deviceByRecipe.get(r.id)?.badge ?? null}`

- [ ] **Step 6: Add the badge style**

In the `StyleSheet.create` block, next to the existing `useItUp` style (~line 1124):

```ts
  deviceBadge: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    marginTop: tokens.space(1),
    color: tokens.color.accent,
  },
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck` — expected exit 0.
Run: `npm test --workspace @breadbox/mobile` — expected PASS (no behavior change yet; selection is `[]`).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/features/recipes/RecipesScreen.tsx
git commit -m "feat(cook): device boost joins the ranking blend + card badge plumbing"
```

---

### Task 4: Prompt card + "Cooking with" chip row

**Files:**
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx`

- [ ] **Step 1: Import the hook and device list**

Add `COOKING_DEVICES` to the `@breadbox/core` import block, and below the other feature imports:

```ts
import { useTonightDevices } from './useTonightDevices';
```

- [ ] **Step 2: Wire the hook into `RecipesScreen`**

Inside `RecipesScreen` (~line 219, next to `useRecipePrefs`):

```ts
  const tonight = useTonightDevices(activeHouseholdId);
  // Prompt-card selection buffer — committed on "Show me recipes".
  const [pendingDevices, setPendingDevices] = useState<CookingDevice[]>([]);
```

In the existing `useFocusEffect` callback (~line 231), add a `refreshDay` call so a tab left mounted across midnight re-asks:

```ts
  useFocusEffect(
    useCallback(() => {
      const h = new Date().getHours();
      setHour(h);
      if (!userPickedMeal.current) setMeal(defaultMealForHour(h));
      tonight.refreshDay();
    }, [tonight.refreshDay]),
  );
```

Add the toggle helper next to `changeMeal` (~line 332):

```ts
  function toggleTonightDevice(id: CookingDevice) {
    const next = tonight.devices.includes(id)
      ? tonight.devices.filter((d) => d !== id)
      : [...tonight.devices, id];
    tonight.setDevices(next);
  }
```

- [ ] **Step 3: Render the collapsed chip row (answered state)**

In the `headerPad` view, immediately after the meal-chips `<View style={styles.chips}>…</View>` block (~line 381):

```tsx
        {tonight.answered && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.deviceRow}
          >
            <Text style={styles.deviceRowLabel}>Cooking with</Text>
            <Pressable
              onPress={() => tonight.setDevices([])}
              style={[styles.chip, tonight.devices.length === 0 && styles.chipSelected]}
            >
              <Text style={[styles.chipText, tonight.devices.length === 0 && styles.chipTextSelected]}>
                Any
              </Text>
            </Pressable>
            {COOKING_DEVICES.map((d) => {
              const on = tonight.devices.includes(d.id);
              return (
                <Pressable
                  key={d.id}
                  onPress={() => toggleTonightDevice(d.id)}
                  style={[styles.chip, on && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextSelected]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
```

- [ ] **Step 4: Render the prompt card (unanswered state)**

Immediately before the `{recipeState.kind === 'ok' && (<CookThis …/>)}` block (~line 474):

```tsx
      {recipeState.kind === 'ok' && !tonight.answered && (
        <View style={styles.deviceCard}>
          <View style={styles.deviceCardHead}>
            <Text style={styles.deviceCardTitle}>
              What are you cooking with {mealtimeLabel(hour)}?
            </Text>
            <Pressable
              hitSlop={8}
              onPress={tonight.dismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss — show everything"
            >
              <X size={16} color={tokens.color.inkMuted} />
            </Pressable>
          </View>
          <View style={styles.deviceCardChips}>
            {COOKING_DEVICES.map((d) => {
              const on = pendingDevices.includes(d.id);
              return (
                <Pressable
                  key={d.id}
                  onPress={() =>
                    setPendingDevices((prev) =>
                      prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id],
                    )
                  }
                  style={[styles.chip, on && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextSelected]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.deviceCardActions}>
            <Pressable onPress={tonight.dismiss} hitSlop={6}>
              <Text style={styles.deviceCardSkip}>Anything goes</Text>
            </Pressable>
            {pendingDevices.length > 0 && (
              <Pressable
                style={styles.deviceCardGo}
                onPress={() => tonight.setDevices(pendingDevices)}
              >
                <Text style={styles.deviceCardGoTxt}>Show me recipes</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
```

Note: `mealtimeLabel(hour)` yields "tonight" / "this morning" / "for lunch" / "this afternoon" / "right now" — all read naturally in the sentence.

- [ ] **Step 5: Pass the real selection to `CookThis`**

Replace the Task 3 placeholder `tonightDevices={[]}` with:

```tsx
          tonightDevices={tonight.devices}
```

- [ ] **Step 6: Add the styles**

In `StyleSheet.create`, near the existing `chips` styles:

```ts
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2), paddingTop: tokens.space(2) },
  deviceRowLabel: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.inkMuted },
  deviceCard: {
    marginHorizontal: tokens.space(4),
    marginBottom: tokens.space(2),
    padding: tokens.space(4),
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surfaceAlt,
    borderWidth: 1,
    borderColor: tokens.color.line,
  },
  deviceCardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  deviceCardTitle: {
    flex: 1,
    fontFamily: tokens.font.display.semibold,
    fontSize: 16,
    color: tokens.color.ink,
    paddingRight: tokens.space(2),
  },
  deviceCardChips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2), marginTop: tokens.space(3) },
  deviceCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: tokens.space(3),
  },
  deviceCardSkip: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.inkMuted },
  deviceCardGo: {
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
  },
  deviceCardGoTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.onAccent },
```

(Reuses the existing `chip` / `chipSelected` / `chipText` / `chipTextSelected` styles for all device chips.)

- [ ] **Step 7: Verify**

Run: `npm run typecheck` — expected exit 0.
Run: `npm test --workspace @breadbox/mobile` — expected PASS.
Run: `npm run lint` — expected exit 0 (no new warnings in changed files).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/features/recipes/RecipesScreen.tsx
git commit -m "feat(cook): 'what are you cooking with tonight?' prompt card + chip row"
```

---

### Task 5: End-to-end verification in the running app

**Files:** none (verification only)

- [ ] **Step 1: Run the full test matrix**

```bash
npm test --workspace @breadbox/core
npm test --workspace @breadbox/mobile
npm run typecheck
```

Expected: all PASS / exit 0.

- [ ] **Step 2: Drive the feature in the app**

Launch the mobile app (use the project's `/run` skill or `npx expo start` in `apps/mobile`) and verify on the Cook tab:

1. Prompt card appears once recipes load: "What are you cooking with tonight?" (wording varies by hour).
2. Multi-select two devices → "Show me recipes" → card collapses to the "Cooking with" chip row; matching recipes rise and show e.g. "Grill pick" badges; non-matching recipes remain visible.
3. Toggle a chip → re-rank is instant, no loading skeleton (no refetch).
4. "Any" chip clears the selection; badges disappear; order returns to baseline.
5. Kill + relaunch the app same day → no prompt (choice remembered); chip row shows the saved selection.
6. Dismiss path: clear app storage or wait for the next day, dismiss the card via X → no re-prompt that day, ranking unchanged.

- [ ] **Step 3: Update plan checkboxes and commit any doc changes**

```bash
git add docs/superpowers/plans/2026-07-10-cooking-device-picker.md
git commit -m "docs(plan): check off cooking-device picker tasks"
```

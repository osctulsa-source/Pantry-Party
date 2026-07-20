# Install → First Match (P0 + P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a brand-new user's first Cook-tab session end in "here's what I can cook right now," and instrument the funnel so we can prove it.

**Architecture:** Two phases. **P0 (analytics)** adds a thin, fire-and-forget `track()` client that best-effort inserts funnel events into a new append-only `analytics_events` table — it never throws, so it can ship first and safely. **P1 (land on the match)** routes a user who seeded staples during onboarding straight to the Cook tab, and replaces the empty-pantry dead-end with a zero-input curated browse so the tab is never a blank wall. No new engine: staple-seeding, the pantry-match card, barcode capture, and the shopping list already exist — this plan only wires the last mile and measures it.

**Tech Stack:** React Native / Expo, TypeScript, React Navigation (native-stack + bottom-tabs), PowerSync (SQLite/sync), Supabase (auth + PostgREST), Jest (jest-expo).

**Context this plan relies on (verified against the code):**
- `searchCurated` returns `[]` for an empty pantry — [curatedSource.ts:68](../../../apps/mobile/src/data/curated/curatedSource.ts#L68).
- Onboarding already seeds staples into PowerSync but then lands the user on `PantryTab` — [OnboardingScreen.tsx](../../../apps/mobile/src/features/onboarding/OnboardingScreen.tsx), [MainTabs.tsx:49](../../../apps/mobile/src/navigation/MainTabs.tsx#L49).
- On a brand-new signup the household is created **asynchronously**; PR #204 (`84a1a66`) buffers staple taps that land during that race. Onboarding's `finish()` already gates `onDone()` on the staple queue draining — **P1 routing depends on that gate and must not weaken it.**
- The result card already leads with the photo and shows used/missed counts + "add missing to shopping list" — [RecipesScreen.tsx:1086](../../../apps/mobile/src/features/recipes/RecipesScreen.tsx#L1086). This plan does **not** rebuild it.
- There is **no** product analytics today (only Sentry errors + on-device scanLog).

**Non-goals (explicitly deferred):** vision/snap-your-shelf; an offline analytics outbox (dropped events on offline are acceptable for early funnel measurement); any change to barcode capture, the shopping list, or the recipe card layout.

---

## File Structure

**P0 — Analytics**
- Create: `infra/local-dev/docker/modules/database-postgres/migrations/0009_analytics_events.sql` — dev-Postgres table (no RLS, matches repo convention).
- Create: `infra/local-dev/docker/modules/database-postgres/init-scripts/06-analytics-events.sql` — fresh-volume mirror (lockstep rule).
- Create: `apps/mobile/src/observability/analytics.ts` — `track()`, `getInstallId()`, the `AnalyticsEvent` union.
- Create: `apps/mobile/src/observability/analytics.test.ts` — the "never throws" guarantee.
- Modify: `apps/mobile/src/features/onboarding/OnboardingScreen.tsx` — emit `onboarding_started`, `staples_seeded`.
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx` — emit `first_match_shown`, `recipe_opened`, `cook_this_confirmed`.

**P1 — Land on the match**
- Modify: `apps/mobile/src/data/curated/curatedSource.ts` — add `browseCurated()`.
- Create: `apps/mobile/src/data/curated/curatedSource.test.ts` — `browseCurated` unit tests.
- Modify: `apps/mobile/src/features/onboarding/OnboardingScreen.tsx` — `onDone` reports whether a pantry was seeded.
- Modify: `apps/mobile/App.tsx` — thread `landOnCook` into `MainTabs` initial params.
- Create: `apps/mobile/src/features/recipes/CuratedBrowse.tsx` — zero-input browse feed + card.
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx` — render `CuratedBrowse` for the `no-pantry` empty state.

**Verification commands (run from `apps/mobile`):**
- Tests: `npx jest <path>`
- Types: `npx tsc --noEmit` (root typecheck is known-broken; use the mobile package's tsc)
- Lint: `npm run lint`

---

# PHASE P0 — FUNNEL ANALYTICS (ship first)

### Task 1: `analytics_events` table (dev migration + init-script)

**Files:**
- Create: `infra/local-dev/docker/modules/database-postgres/migrations/0009_analytics_events.sql`
- Create: `infra/local-dev/docker/modules/database-postgres/init-scripts/06-analytics-events.sql`

> **Why no RLS here:** the local dev Postgres is a plain Postgres (the PowerSync upload-proxy owns tenancy) — it has no `authenticated` role and no `auth.uid()`, so an RLS policy referencing them would fail `ON_ERROR_STOP`. The prod RLS policy is a managed-Supabase deploy step, given at the end of this task, **not** run against dev.

- [ ] **Step 1: Write the dev migration**

Create `infra/local-dev/docker/modules/database-postgres/migrations/0009_analytics_events.sql`:

```sql
-- Migration 0009 — analytics_events (install → first-match funnel, July 2026).
--
-- Write-only product telemetry. The mobile app best-effort INSERTs one row per
-- funnel event (onboarding_started / staples_seeded / first_match_shown /
-- recipe_opened / cook_this_confirmed) directly via PostgREST — NOT PowerSync.
-- Analytics is fire-and-forget and never synced back to devices, so this table
-- is deliberately ABSENT from the `powersync` publication (init-script 08 is
-- untouched).
--
-- Privacy-first: no PII beyond the authenticated user id (needed for the prod
-- RLS policy) and an anonymous per-install uuid. `event` is plain TEXT with no
-- CHECK — the client's AnalyticsEvent union owns the allowed set (same
-- reasoning as activity_events.kind in migration 0005). `props` is a small
-- JSONB bag.
--
-- Idempotent. Lockstep: init-scripts/06-analytics-events.sql creates this for
-- fresh volumes. RLS is a managed-Supabase concern (see the migration trailer),
-- intentionally omitted here because dev Postgres has no auth schema.

CREATE TABLE IF NOT EXISTS analytics_events (
  id           UUID         PRIMARY KEY,
  install_id   TEXT         NOT NULL,
  user_id      UUID,
  event        TEXT         NOT NULL,
  props        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  TIMESTAMPTZ  NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_time
  ON analytics_events (event, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_install
  ON analytics_events (install_id, occurred_at);
```

- [ ] **Step 2: Write the init-script mirror**

Create `infra/local-dev/docker/modules/database-postgres/init-scripts/06-analytics-events.sql` with identical DDL (fresh volumes run init-scripts, not migrations):

```sql
-- Init 06 — analytics_events (see migrations/0009_analytics_events.sql).
-- Current-schema mirror for fresh Postgres volumes. Not in the powersync
-- publication (write-only telemetry, never synced to devices).

CREATE TABLE IF NOT EXISTS analytics_events (
  id           UUID         PRIMARY KEY,
  install_id   TEXT         NOT NULL,
  user_id      UUID,
  event        TEXT         NOT NULL,
  props        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  TIMESTAMPTZ  NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_time
  ON analytics_events (event, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_install
  ON analytics_events (install_id, occurred_at);
```

- [ ] **Step 3: Apply to local dev and verify the table exists**

Run (from repo root):

```bash
docker compose -f infra/local-dev/docker/docker-compose.yaml exec -T pg-db \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < infra/local-dev/docker/modules/database-postgres/migrations/0009_analytics_events.sql
```

Then verify:

```bash
docker compose -f infra/local-dev/docker/docker-compose.yaml exec -T pg-db \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d analytics_events"'
```

Expected: the table prints with columns `id, install_id, user_id, event, props, occurred_at, created_at`.

> If the local Docker stack isn't running, skip this step — it's a dev convenience. The client (Task 2) swallows insert failures, so the app runs fine without the table.

- [ ] **Step 4: Commit**

```bash
git add infra/local-dev/docker/modules/database-postgres/migrations/0009_analytics_events.sql \
        infra/local-dev/docker/modules/database-postgres/init-scripts/06-analytics-events.sql
git commit -m "feat(analytics): add analytics_events table (dev migration + init-script)"
```

- [ ] **Step 5: Record the PROD deploy step for the owner (do NOT run against dev)**

Managed Supabase needs the same table **plus** RLS. Hand this SQL to whoever applies prod migrations (see `memory/managed-stack.md`); run it in the Supabase SQL editor, not against local dev:

```sql
-- PROD (managed Supabase) ONLY — analytics_events + write-only RLS.
CREATE TABLE IF NOT EXISTS analytics_events (
  id           UUID         PRIMARY KEY,
  install_id   TEXT         NOT NULL,
  user_id      UUID,
  event        TEXT         NOT NULL,
  props        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  TIMESTAMPTZ  NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_time
  ON analytics_events (event, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_install
  ON analytics_events (install_id, occurred_at);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Clients may INSERT only their own rows; no client SELECT/UPDATE/DELETE.
-- The funnel is queried with the service role / dashboard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'analytics_events' AND policyname = 'analytics_insert_own'
  ) THEN
    CREATE POLICY analytics_insert_own ON analytics_events
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
```

No commit for this step — it's an operational note captured in the plan. Flag it in the PR description.

---

### Task 2: `analytics.ts` client module

**Files:**
- Create: `apps/mobile/src/observability/analytics.ts`
- Test: `apps/mobile/src/observability/analytics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/observability/analytics.test.ts`:

```ts
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid' }));

const insert = jest.fn().mockRejectedValue(new Error('network down'));
jest.mock('../data/supabase/client', () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) },
    from: jest.fn(() => ({ insert })),
  },
}));

import { track } from './analytics';

describe('track', () => {
  it('never throws even when the insert rejects', async () => {
    await expect(track('recipe_opened', { id: 1 })).resolves.toBeUndefined();
  });

  it('attempts exactly one insert into analytics_events', async () => {
    insert.mockClear();
    await track('first_match_shown', { count: 3 });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/observability/analytics.test.ts` (from `apps/mobile`)
Expected: FAIL — "Cannot find module './analytics'".

- [ ] **Step 3: Write the module**

Create `apps/mobile/src/observability/analytics.ts`:

```ts
/**
 * analytics — minimal, privacy-first product-funnel telemetry.
 *
 * Fire-and-forget: track() best-effort INSERTs one row into Supabase's
 * append-only `analytics_events` table and NEVER throws — telemetry must not
 * break a user flow (same contract as scanLog). No PII: an anonymous per-
 * install uuid (AsyncStorage) + the authenticated user id (for prod RLS) + the
 * event name + a small JSON prop bag. No offline outbox yet: events that fail
 * to send (offline, or table absent in dev) are dropped, which is acceptable
 * for early funnel measurement. Measures the install → first-match funnel.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { supabase } from '../data/supabase/client';

export type AnalyticsEvent =
  | 'onboarding_started'
  | 'staples_seeded'
  | 'first_match_shown'
  | 'recipe_opened'
  | 'cook_this_confirmed';

const INSTALL_ID_KEY = 'analytics:installId';
let cachedInstallId: string | null = null;

/** Stable anonymous per-install id; cached in-memory after first read. */
export async function getInstallId(): Promise<string> {
  if (cachedInstallId) return cachedInstallId;
  try {
    const existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
    if (existing) {
      cachedInstallId = existing;
      return existing;
    }
  } catch {
    // fall through and mint a fresh id
  }
  const fresh = Crypto.randomUUID();
  cachedInstallId = fresh;
  try {
    await AsyncStorage.setItem(INSTALL_ID_KEY, fresh);
  } catch {
    // Non-fatal: worst case a new id next launch.
  }
  return fresh;
}

/** Fire-and-forget funnel event. Never throws. Call as `void track(...)`. */
export async function track(
  event: AnalyticsEvent,
  props: Record<string, string | number | boolean> = {},
): Promise<void> {
  try {
    const [installId, sessionRes] = await Promise.all([
      getInstallId(),
      supabase.auth.getSession(),
    ]);
    const userId = sessionRes.data.session?.user?.id ?? null;
    await supabase.from('analytics_events').insert({
      id: Crypto.randomUUID(),
      install_id: installId,
      user_id: userId,
      event,
      props,
      occurred_at: new Date().toISOString(),
    });
  } catch {
    // Telemetry must never break a user flow.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/observability/analytics.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/observability/analytics.ts apps/mobile/src/observability/analytics.test.ts
git commit -m "feat(analytics): fire-and-forget track() client for the first-match funnel"
```

---

### Task 3: Instrument the five funnel events

**Files:**
- Modify: `apps/mobile/src/features/onboarding/OnboardingScreen.tsx` (`onboarding_started`, `staples_seeded`)
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx` (`first_match_shown`, `recipe_opened`, `cook_this_confirmed`)

> No unit test — these are one-line emissions into UI event handlers; jest can't meaningfully exercise them without full navigation harnesses. They're verified in the Task 8 QA pass. Keep each `void track(...)` non-blocking.

- [ ] **Step 1: Import `track` in OnboardingScreen**

In `apps/mobile/src/features/onboarding/OnboardingScreen.tsx`, add to the imports (after the `DietStep` import near the top):

```ts
import { track } from '../../observability/analytics';
```

- [ ] **Step 2: Emit `onboarding_started` on mount**

In `OnboardingScreen`, add this effect immediately after the `const { profile, save: saveProfile, loadedFor: profileLoadedFor } = useTasteProfile(activeHouseholdId);` line:

```ts
  useEffect(() => {
    void track('onboarding_started');
  }, []);
```

- [ ] **Step 3: Emit `staples_seeded` as the flow finishes**

Find the finish effect (currently):

```ts
  useEffect(() => {
    if (finishing && pendingStaples.length === 0 && !flushing) onDone();
  }, [finishing, pendingStaples, flushing, onDone]);
```

Replace it with (note: `onDone` signature changes in Task 5 — this already passes the object it will expect):

```ts
  useEffect(() => {
    if (finishing && pendingStaples.length === 0 && !flushing) {
      // count === 0 means the user skipped seeding — a first-class funnel signal.
      void track('staples_seeded', { count: added.length });
      onDone({ seededPantry: added.length > 0 });
    }
  }, [finishing, pendingStaples, flushing, onDone, added.length]);
```

> This step makes `onDone` a call-with-argument. The prop type is widened in Task 5. If you are running Task 3 strictly before Task 5, `npx tsc --noEmit` will flag the `onDone` call until Task 5 lands — that's expected; the two tasks are a pair. Run them back-to-back.

- [ ] **Step 4: Import `track` in RecipesScreen**

In `apps/mobile/src/features/recipes/RecipesScreen.tsx`, add near the other local imports (e.g. after the `searchCurated` import):

```ts
import { track } from '../../observability/analytics';
```

- [ ] **Step 5: Emit `first_match_shown` the first time matches render**

In `RecipesScreen` (the outer component), add a ref beside the other refs and an effect. Put the ref declaration next to `const seenIdsRef = useRef<Set<number>>(new Set());`:

```ts
  const firstMatchLoggedRef = useRef(false);
```

Add this effect just after the `useEffect(() => { ... }, [savedToast]);` auto-dismiss effect:

```ts
  // Fire once per screen lifetime when the pantry first yields matches — the
  // funnel's payoff event. `ok` only ever means pantry-matched results; the
  // zero-input browse renders under the `empty` branch, not here.
  useEffect(() => {
    if (recipeState.kind === 'ok' && !firstMatchLoggedRef.current) {
      firstMatchLoggedRef.current = true;
      void track('first_match_shown', { count: recipeState.recipes.length });
    }
  }, [recipeState]);
```

- [ ] **Step 6: Emit `recipe_opened` and `cook_this_confirmed`**

In the inner `CookThis` component, find `onOpen`:

```ts
  function onOpen(r: SpoonacularRecipe) {
    record(r.title, 'open');
    navigation.navigate('RecipeDetail', { recipe: r });
  }
```

Replace with:

```ts
  function onOpen(r: SpoonacularRecipe) {
    record(r.title, 'open');
    void track('recipe_opened', { id: r.id });
    navigation.navigate('RecipeDetail', { recipe: r });
  }
```

Find `onCookDone`:

```ts
  function onCookDone(r: SpoonacularRecipe, updatedCount: number) {
    // Cooking a recipe is the strongest preference signal we collect.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    record(r.title, 'like');
    setCooking(null);
    onCookComplete(updatedCount);
  }
```

Replace with:

```ts
  function onCookDone(r: SpoonacularRecipe, updatedCount: number) {
    // Cooking a recipe is the strongest preference signal we collect.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    record(r.title, 'like');
    void track('cook_this_confirmed', { id: r.id, itemsUpdated: updatedCount });
    setCooking(null);
    onCookComplete(updatedCount);
  }
```

- [ ] **Step 7: Typecheck (expect the paired-task note from Step 3)**

Run: `npx tsc --noEmit`
Expected: clean **once Task 5 has landed**; if running Task 3 alone, the only error is the `onDone(...)` call in OnboardingScreen — proceed to Task 5.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/features/onboarding/OnboardingScreen.tsx \
        apps/mobile/src/features/recipes/RecipesScreen.tsx
git commit -m "feat(analytics): instrument the install -> first-match funnel events"
```

---

# PHASE P1 — LAND ON THE MATCH

### Task 4: `browseCurated()` — zero-input curated listing

**Files:**
- Modify: `apps/mobile/src/data/curated/curatedSource.ts`
- Test: `apps/mobile/src/data/curated/curatedSource.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/data/curated/curatedSource.test.ts`:

```ts
import { browseCurated } from './curatedSource';

describe('browseCurated', () => {
  it('returns curated recipes with no pantry-match counts', () => {
    const res = browseCurated({ number: 5 });
    expect(res.length).toBeGreaterThan(0);
    expect(res.length).toBeLessThanOrEqual(5);
    for (const r of res) {
      expect(r.usedIngredientCount).toBe(0);
      expect(r.missedIngredientCount).toBe(0);
      expect(r.usedIngredientNames).toEqual([]);
      expect(r.missedIngredientNames).toEqual([]);
    }
  });

  it('filters by meal type to a subset of the unfiltered set', () => {
    const all = browseCurated({ number: 500 });
    const desserts = browseCurated({ type: 'dessert', number: 500 });
    const allIds = new Set(all.map((r) => r.id));
    expect(desserts.length).toBeGreaterThan(0);
    expect(desserts.length).toBeLessThan(all.length);
    for (const r of desserts) expect(allIds.has(r.id)).toBe(true);
  });

  it('orders by ready time ascending, unknown times last', () => {
    const res = browseCurated({ number: 500 });
    const times = res.map((r) => r.readyInMinutes ?? Number.POSITIVE_INFINITY);
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it('pages via offset', () => {
    const first = browseCurated({ number: 3, offset: 0 });
    const second = browseCurated({ number: 3, offset: 3 });
    expect(first.map((r) => r.id)).not.toEqual(second.map((r) => r.id));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/data/curated/curatedSource.test.ts`
Expected: FAIL — "browseCurated is not a function" / no export.

- [ ] **Step 3: Add `browseCurated` to `curatedSource.ts`**

In `apps/mobile/src/data/curated/curatedSource.ts`, append after the `searchCurated` function (end of file):

```ts
export interface CuratedBrowseOptions {
  /** Meal filter; omit for any. */
  type?: MealType;
  /** Max results (default 10). */
  number?: number;
  /** Page through the list. */
  offset?: number;
}

/**
 * Zero-input browse: the curated set listed WITHOUT a pantry to match against —
 * the empty/skipped-pantry payoff so the Cook tab is never a blank wall. No
 * pantry means no used/missed counts (all zeroed), so callers must render these
 * with a browse-style card, NOT the pantry-match card (which would read
 * "Uses 0 of 0"). Ordered quickest-first so the fastest wins lead.
 */
export function browseCurated(opts: CuratedBrowseOptions = {}): SpoonacularRecipe[] {
  const { type, number = 10, offset = 0 } = opts;
  const list: SpoonacularRecipe[] = CURATED.filter((r) => !type || r.mealType === type).map((r) => ({
    ...r,
    likes: 0,
    usedIngredientNames: [],
    missedIngredientNames: [],
    usedIngredientCount: 0,
    missedIngredientCount: 0,
  }));
  list.sort((a, b) => {
    const at = a.readyInMinutes ?? Number.POSITIVE_INFINITY;
    const bt = b.readyInMinutes ?? Number.POSITIVE_INFINITY;
    return at - bt || a.title.localeCompare(b.title);
  });
  return list.slice(offset, offset + number);
}
```

`MealType` and `SpoonacularRecipe` are already imported at the top of the file; no new imports needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/data/curated/curatedSource.test.ts`
Expected: PASS (all four).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` (expected clean).

```bash
git add apps/mobile/src/data/curated/curatedSource.ts apps/mobile/src/data/curated/curatedSource.test.ts
git commit -m "feat(recipes): browseCurated() zero-input curated listing"
```

---

### Task 5: Route to the Cook tab after seeding staples

**Files:**
- Modify: `apps/mobile/src/features/onboarding/OnboardingScreen.tsx` (`onDone` signature)
- Modify: `apps/mobile/App.tsx` (`AppRoot`, `AppStack`, `MainTabs` initial params)

> **Race safety (#204):** `onDone` fires only from the finish effect, which already waits for `pendingStaples.length === 0 && !flushing` — i.e. the household has resolved and every staple has been written to PowerSync. So by the time we route to Cook, the seeded items are locally queryable and `usePantryItems` will surface them. We change *where the user lands*, not *when they land* — the existing gate is untouched.

- [ ] **Step 1: Widen the `onDone` prop type in OnboardingScreen**

In `apps/mobile/src/features/onboarding/OnboardingScreen.tsx`, change the component signature:

```ts
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
```

to:

```ts
export function OnboardingScreen({ onDone }: { onDone: (result: { seededPantry: boolean }) => void }) {
```

(The finish effect already calls `onDone({ seededPantry: added.length > 0 })` from Task 3, Step 3.)

- [ ] **Step 2: Hold the landing intent in AppRoot**

In `apps/mobile/App.tsx`, find `AppRoot`:

```ts
function AppRoot() {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.session.user.id : null;
  const { needsOnboarding, loading: onboardingLoading, complete } = useOnboarding(userId);
```

Add a landing-intent state right after the `useOnboarding` line:

```ts
  // After onboarding, land a user who SEEDED staples straight on the Cook tab
  // (their first match is the payoff); a user who skipped lands on Pantry as
  // before. Consumed as MainTabs' initial nested route in AppStack.
  const [landOnCook, setLandOnCook] = useState(false);
```

- [ ] **Step 3: Pass the intent through `complete()` and into AppStack**

Still in `AppRoot`, replace:

```ts
  if (needsOnboarding) {
    return <OnboardingScreen onDone={complete} />;
  }

  return <AppStack />;
```

with:

```ts
  if (needsOnboarding) {
    return (
      <OnboardingScreen
        onDone={({ seededPantry }) => {
          setLandOnCook(seededPantry);
          void complete();
        }}
      />
    );
  }

  return <AppStack landOnCook={landOnCook} />;
```

- [ ] **Step 4: Accept the prop in AppStack and set the initial nested route**

In `apps/mobile/App.tsx`, change the `AppStack` signature:

```ts
function AppStack() {
```

to:

```ts
function AppStack({ landOnCook }: { landOnCook: boolean }) {
```

Then find the MainTabs screen registration:

```ts
      <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
```

Replace with:

```ts
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
        initialParams={landOnCook ? { screen: 'CookTab' } : undefined}
      />
```

`RootStackParamList.MainTabs` is `NavigatorScreenParams<TabParamList> | undefined`, so `{ screen: 'CookTab' }` typechecks. Passing it as `initialParams` navigates the nested bottom-tab navigator to `CookTab` on first mount, overriding its `initialRouteName="PantryTab"` for this session only.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (this resolves the Task 3 `onDone(...)` note).

- [ ] **Step 6: Run the full mobile test suite (nothing should regress)**

Run: `npx jest`
Expected: PASS. (Existing tests don't cover App routing; this confirms no collateral breakage.)

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/App.tsx apps/mobile/src/features/onboarding/OnboardingScreen.tsx
git commit -m "feat(onboarding): land seeded users on the Cook tab (match as the payoff)"
```

---

### Task 6: Zero-input browse for the empty-pantry Cook tab

**Files:**
- Create: `apps/mobile/src/features/recipes/CuratedBrowse.tsx`
- Modify: `apps/mobile/src/features/recipes/RecipesScreen.tsx` (empty-state branch)

> Purpose: a user who skipped seeding (or emptied their pantry) currently hits a dead-end "Your pantry is the menu" screen. Replace it — for the `no-pantry` reason only — with a photo-forward curated browse plus an "Add to pantry" CTA back into Quick Add. The other empty reasons (`all-excluded`, `no-match`) keep their existing copy.

- [ ] **Step 1: Create the browse component**

Create `apps/mobile/src/features/recipes/CuratedBrowse.tsx`:

```tsx
/**
 * CuratedBrowse — the zero-input Cook-tab state. When there's no pantry to
 * match against, we still lead with the new photography: a quick-first list of
 * curated house recipes, each tapping through to RecipeDetail, above a CTA that
 * routes back into Quick Add so the user can stock up. Deliberately NOT the
 * pantry-match card (no used/missed counts exist here) — a lean browse card.
 */
import { useMemo } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Clock, Plus, Users } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MealType } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { browseCurated } from '../../data/curated/curatedSource';
import { resolveRecipeImageSource } from '../../data/curated/resolveRecipeImage';
import type { SpoonacularRecipe } from '../../data/spoonacular/types';
import type { RootStackParamList } from '../../../App';

export function CuratedBrowse({
  meal,
  onAddToPantry,
}: {
  meal: MealType | 'any';
  onAddToPantry: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const recipes = useMemo(
    () => browseCurated({ type: meal === 'any' ? undefined : meal, number: 20 }),
    [meal],
  );

  return (
    <FlatList
      data={recipes}
      keyExtractor={(r) => String(r.id)}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      ListHeaderComponent={
        <View style={styles.head}>
          <Text style={styles.title}>Nothing in your pantry yet</Text>
          <Text style={styles.sub}>
            Here's what the Pantry Party kitchen is cooking — add a few staples and we'll match
            recipes to what you actually have.
          </Text>
          <Pressable style={styles.cta} onPress={onAddToPantry} accessibilityRole="button">
            <Plus size={16} color={tokens.color.onAccent} />
            <Text style={styles.ctaTxt}>Add to your pantry</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item }) => (
        <BrowseCard recipe={item} onOpen={() => navigation.navigate('RecipeDetail', { recipe: item })} />
      )}
    />
  );
}

function BrowseCard({ recipe, onOpen }: { recipe: SpoonacularRecipe; onOpen: () => void }) {
  const imageSource = resolveRecipeImageSource(recipe);
  return (
    <Pressable style={styles.card} onPress={onOpen} accessibilityRole="button">
      {imageSource ? (
        <Image source={imageSource} style={styles.img} />
      ) : (
        <View style={[styles.img, styles.imgPlaceholder]} />
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {recipe.title}
        </Text>
        <View style={styles.metaRow}>
          {recipe.readyInMinutes !== null && (
            <View style={styles.metaChip}>
              <Clock size={12} color={tokens.color.inkMuted} />
              <Text style={styles.metaTxt}>{recipe.readyInMinutes} min</Text>
            </View>
          )}
          {recipe.servings !== null && (
            <View style={styles.metaChip}>
              <Users size={12} color={tokens.color.inkMuted} />
              <Text style={styles.metaTxt}>Serves {recipe.servings}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: tokens.space(4), paddingBottom: tokens.space(8) },
  head: { marginBottom: tokens.space(4) },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 22,
    color: tokens.color.ink,
    letterSpacing: -0.4,
    marginBottom: tokens.space(2),
  },
  sub: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    lineHeight: 20,
    marginBottom: tokens.space(4),
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space(2),
    paddingVertical: tokens.space(3),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
  },
  ctaTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
  card: {
    flexDirection: 'row',
    gap: tokens.space(3),
    marginBottom: tokens.space(3),
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.line,
    overflow: 'hidden',
  },
  img: { width: 96, height: 96, backgroundColor: tokens.color.surfaceAlt },
  imgPlaceholder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: tokens.color.line },
  cardBody: { flex: 1, paddingVertical: tokens.space(3), paddingRight: tokens.space(3), justifyContent: 'center' },
  cardTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 15,
    color: tokens.color.ink,
    marginBottom: tokens.space(2),
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(1) },
  metaTxt: { fontFamily: tokens.font.body.medium, fontSize: 12, color: tokens.color.inkMuted },
});
```

- [ ] **Step 2: Import CuratedBrowse in RecipesScreen**

In `apps/mobile/src/features/recipes/RecipesScreen.tsx`, add near the other feature imports:

```ts
import { CuratedBrowse } from './CuratedBrowse';
```

- [ ] **Step 3: Branch the empty state so `no-pantry` shows the browse**

Find the empty-state block:

```tsx
      {recipeState.kind === 'empty' && (
        <View style={styles.center}>
          <BrandEmptyArt foods={['bread', 'tomato', 'herb']} />
          <Text style={styles.errorTitle}>
            {recipeState.reason === 'no-pantry'
              ? 'Your pantry is the menu'
              : recipeState.reason === 'all-excluded'
                ? "Everything's on the bench"
                : "That's everything we found"}
          </Text>
          <Text style={styles.helper}>
            {recipeState.reason === 'no-pantry'
              ? "Add what's in your fridge and we'll figure out dinner."
              : recipeState.reason === 'all-excluded'
                ? "You excluded all your ingredients — bring some back or hit Reset."
                : "Try a different meal type, bring back an ingredient, or hit Refresh for new inspiration."}
          </Text>
          {canReset && (
            <Pressable style={styles.resetBtn} onPress={reset}>
              <Text style={styles.resetBtnTxt}>Reset</Text>
            </Pressable>
          )}
        </View>
      )}
```

Replace the whole block with:

```tsx
      {recipeState.kind === 'empty' && recipeState.reason === 'no-pantry' && (
        <CuratedBrowse meal={meal} onAddToPantry={() => navigation.navigate('QuickAdd')} />
      )}

      {recipeState.kind === 'empty' && recipeState.reason !== 'no-pantry' && (
        <View style={styles.center}>
          <BrandEmptyArt foods={['bread', 'tomato', 'herb']} />
          <Text style={styles.errorTitle}>
            {recipeState.reason === 'all-excluded' ? "Everything's on the bench" : "That's everything we found"}
          </Text>
          <Text style={styles.helper}>
            {recipeState.reason === 'all-excluded'
              ? "You excluded all your ingredients — bring some back or hit Reset."
              : 'Try a different meal type, bring back an ingredient, or hit Refresh for new inspiration.'}
          </Text>
          {canReset && (
            <Pressable style={styles.resetBtn} onPress={reset}>
              <Text style={styles.resetBtnTxt}>Reset</Text>
            </Pressable>
          )}
        </View>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (`navigation.navigate('QuickAdd')` — `QuickAdd: undefined` is already registered in `RootStackParamList`.)

- [ ] **Step 5: Run the suite**

Run: `npx jest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/recipes/CuratedBrowse.tsx apps/mobile/src/features/recipes/RecipesScreen.tsx
git commit -m "feat(recipes): zero-input curated browse for the empty-pantry Cook tab"
```

---

### Task 7: Final verification (types, lint, tests)

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run (from `apps/mobile`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint (gates CI)**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Full test suite**

Run: `npx jest`
Expected: all suites pass, including the new `analytics.test.ts` and `curatedSource.test.ts`.

---

### Task 8: On-device QA (manual, on a simulator or device)

**Files:** none.

- [ ] **Step 1: Fresh-user seed → land on Cook**

Sign up as a brand-new user. In onboarding step 2, tap 3–4 staples (e.g. Eggs, Onion, Garlic, Rice), then Continue. **Expected:** the app opens on the **Cook tab**, showing matched house recipes (photos + "Uses N of M" lines) — not the Pantry tab.

- [ ] **Step 2: Fresh-user skip → browse, not a dead-end**

Sign up as another new user. In step 2, tap **Skip for now**. **Expected:** lands on Pantry (unchanged); open the Cook tab and confirm it shows the **"Nothing in your pantry yet"** browse (photo cards + "Add to your pantry" CTA), not the old empty art. Tap a browse card → RecipeDetail opens. Tap "Add to your pantry" → Quick Add opens.

- [ ] **Step 3: Funnel events reach the table (if prod/staging Supabase is wired)**

With `EXPO_PUBLIC_SUPABASE_URL` pointed at an environment where `analytics_events` exists, complete a run (onboard → open a recipe → "I cooked this"). Query the table:

```sql
SELECT event, props, occurred_at FROM analytics_events ORDER BY occurred_at DESC LIMIT 20;
```

**Expected:** rows for `onboarding_started`, `staples_seeded` (with `count`), `first_match_shown`, `recipe_opened`, `cook_this_confirmed`. If the table doesn't exist in the target env, confirm instead that **no crash or error surfaces** — `track()` must swallow the failure.

- [ ] **Step 4: Race check (#204)**

Cold-start a brand-new signup on a throttled network, seed staples quickly, tap Continue. **Expected:** "Finishing up…" briefly, then lands on Cook with the seeded staples already matched (no empty flash, no lost staples).

---

## Self-Review notes (author check against the review)

- **P0 analytics** — covered by Tasks 1–3; table (dev + prod-note), client, five instrumented events. Success metric (`install → seeded → first_match_shown → recipe_opened → cook_this_confirmed`) is now queryable.
- **P1 land-on-match** — routing (Task 5) + zero-input browse (Task 6). The #204 race is explicitly preserved, not re-solved.
- **Type consistency** — `onDone(result: { seededPantry: boolean })` defined in Task 5 matches the call site added in Task 3; `browseCurated` signature in Task 4 matches its use in Task 6's `CuratedBrowse`; `track(event, props)` signature is stable across all call sites.
- **Paired-task hazard called out** — Task 3 Step 3 changes the `onDone` call shape before Task 5 widens the type; the plan flags that these two land back-to-back and that an interim `tsc` error there is expected.
- **Not rebuilt** (already shipped, per the review): the pantry-match result card, "add missing to shopping list", barcode capture, and use-it-up. This plan touches none of them.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-install-to-first-match-p0-p1.md`.

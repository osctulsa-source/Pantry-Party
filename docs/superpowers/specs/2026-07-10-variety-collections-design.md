# Variety Collections — "Pantry Pokédex" — Design

**Date:** 2026-07-10
**Status:** Proof of concept (built behind the Settings entry, no flag)
**Branch:** main (spike-style — small, reversible, self-contained)

## Problem / opportunity

Pantry apps have brutal retention. We want a gamification layer that *increases*
engagement without ever compromising the core promise: know what you have, and
cook from it, as a dependable utility. Prior discussion ruled out the failure
modes explicitly:

- **No artificial gates.** Never lock a recipe or hide core info behind
  usage-time or purchase thresholds — that inverts the product and breaks trust
  (the codebase already commits to "honest, not gamified" — see
  `streakStats.ts`).
- **No money.** Not a monetization surface.
- **Un-grindable.** Reward breadth, not repetition, so it can't be farmed.

The insight that makes this safe: the `foodKinds` taxonomy already enumerates the
common **kinds** of each staple (pasta → Penne/Spaghetti…, cheese →
Cheddar/Mozzarella…). That list *doubles as a collectible set*. Filling it is
something a real, adventurous pantry does anyway.

## Decisions

- **A slot fills only on a SPECIFIC variety.** Logging "Cheddar cheese" fills a
  slot; logging generic "Cheese" fills nothing. This is the whole design: the
  reward pulls in the *same* direction the Add form already nudges (specificity),
  and specific names improve recipe matching. The game makes the data better.
- **Collections are durable.** Progress is computed over the household's ENTIRE
  pantry history (including consumed/removed rows) — you never lose a Pokédex
  entry by eating the item.
- **Un-grindable by construction.** A set advances on DISTINCT varieties only;
  buying the same thing twice earns nothing. Branching out is the only way
  forward — which is exactly the "collect 'em all" pull.
- **Subtle placement.** Reached from Settings (alongside Insights/History), not
  forced into the capture→cook main flow. It's a reward to visit, not a wall.
- **Produce added to the taxonomy.** grapes / apples / peppers guides — produce
  is where "collect the varieties" shines and it honors the driving example
  ("5 different types of grapes").

## Design

### 1. Core module: `packages/core/src/collections.ts` (pure)

`computeCollections(loggedNames: string[]): CollectionsSummary`

- Folds names through `foodKinds.guideFor`; only a resolved `activeKind`
  advances that food's set (de-duped via a per-food `Set`, so raw or DISTINCT
  input yields identical output).
- Emits one `CollectionSet` per guide: `collected` / `remaining` (in canonical
  order), `count`, `total`, `complete`.
- Summary: `varietiesCollected`, `varietiesTotal`, `setsComplete`, `setsTotal`,
  and `nearestToComplete` (the in-progress set with the fewest remaining — the
  "just N more!" nudge).
- Display ordering (tiers): **active** (closest-to-done first) → **complete**
  (trophies) → **untouched**. The near-done set leads because "one more to
  finish" is the strongest, most honest pull.
- Pure/deterministic (names in, summary out) — mirrors `streakStats` so the same
  test style applies. 9 unit tests in `collections.test.ts`.

### 2. Mobile hook: `apps/mobile/src/features/insights/useCollections.ts`

- Reactive PowerSync query: `SELECT DISTINCT name FROM pantry_items WHERE
  household_id = ?` — **no `deleted = 0` filter** (durability; the opposite of
  `usePantryItems`/`usePersonalBank`, which filter tombstones on purpose).
- `useMemo(computeCollections(names))`; updates live as new varieties are logged.

### 3. Mobile screen: `CollectionsScreen.tsx`

- Hero tally (`collected / total`, sets-complete), a "So close!" nudge card for
  `nearestToComplete`, then a card per set: title, progress bar, filled chips
  (✓) + ghost chips (remaining). Crumb-styled, dark-mode safe, mirrors
  `InsightsScreen`. Shown even at zero progress — the aspirational catalog.
- Route registered in `App.tsx` (`Collections`), entry added to `SettingsScreen`.

## What this is NOT (guardrails carried forward)

- Not a paywall, not time/purchase-gated, not a recipe lock.
- Honor-system / user-submitted data (e.g. home-grown provenance) and
  origin/region collections are a **separate, later** dimension — and their
  rewards must stay personal/cosmetic (never competitive leaderboards) because
  the data is unverifiable. This PoC is the free half: variety, on data we
  already capture, zero schema change.

## Verification

- `packages/core`: 195/195 tests pass (9 new for collections; the `foodKinds`
  round-trip test auto-validates the 3 new produce guides).
- `apps/mobile`: `tsc --noEmit` clean (exercises the new core exports + screen).

## Follow-ups (not in this PoC)

- Surface a compact teaser on `InsightsScreen` or Settings row (e.g. the
  nearest-set nudge) once the loop proves out.
- Celebrate set completion with the existing `CookSuccessBurst`-style animation.
- Origin/region collections + honor-system produce submissions (needs a new
  metadata field + OFF `origins_tags`; keep rewards non-competitive).
- Expand the taxonomy (more produce, global staples) to widen the "branch into
  new markets" pull.

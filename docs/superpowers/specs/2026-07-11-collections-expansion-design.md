# Collections Expansion — food + recipe cards — Design

**Date:** 2026-07-11
**Status:** Foundation built (core fully; UI wired, unverified on-device)
**Branch:** feat/collections-gamification (follows the base Collections + icons work)

Builds on [2026-07-10-variety-collections-design.md](2026-07-10-variety-collections-design.md).
Same guardrails throughout: honest, un-grindable, **no gates on core utility**, subtle.

## What this adds

Turns the collection "card" from a progress chip into (1) a richer object with a
**back**, (2) a **two-sided** system — a food collection and a recipe Cookbook
that feed each other, and (3) the beginnings of **living** cards (mastery,
season). Everything durable lives in `packages/core` as pure, tested engines
(the recipe catalog is passed in, so core stays dependency-free); the mobile
layer consumes them.

## Built — core (pure, 215/215 tests)

- **Mastery tiers** — `collections.ts`: `MasteryTier` (empty→bronze→silver→gold)
  + `masteryTier(count,total)`; every `CollectionSet` now carries `tier`.
  Un-grindable: moves on distinct varieties, not repeat-buys.
- **Food↔recipe graph** — `recipeGraph.ts` (reuses the `cooked.ts` matcher):
  `recipesUsingFood`, `matchRecipe` (have/missing, staples free),
  `recipesWithinReach` (closest-cookable first), `signatureRecipe` (the reveal
  when a set completes). `RecipeMeta` is the shared minimal recipe shape.
- **Recipe collections** — `recipeCollections.ts`: `computeRecipeCollections`
  → the Cookbook (distinct recipes cooked / total), the **Cuisine Passport**
  (one slot per cuisine, filled by cooking any dish of it), meal-type coverage,
  and per-recipe `cookCounts` + `firstCooked` (for card backs). Rewards actual
  cooking (the cook log), never grinding.
- **Seasonality** — `seasonality.ts`: `SEASONALITY` data + `isInSeason`,
  `peakSeason`, `inSeasonNow`. Foundation for the "in season" glow.

## Built — mobile UI (typecheck-clean; not yet run on a device)

- **Cookbook screen** (`CookbookScreen` + `useRecipeCollections` + route +
  Settings entry) — recipes-cooked hero, Cuisine Passport stamps, meal coverage.
- **Card back** — tapping a set opens a sheet (`CardBackModal`): mastery tier,
  in-season / peak-season pill, its varieties, and **recipes that use it**
  (the food→recipe link, live over the curated catalog).
- **Mastery medals** — 🥉/🥈 on the set emblem (🏆 stays for gold/complete).

## Scaffolded — foundation in place, not yet surfaced

- **"Recipes within reach"** — engine done (`recipesWithinReach`); the Collections
  cook-teaser is still static copy. Wire it to the live pantry (needs the
  deleted=0 pantry names, which `usePantryItems` already provides) to make it real.
- **Signature-recipe reveal** — `signatureRecipe` exists; surface it as a
  celebration card when a set hits gold (reveal, never a gate).
- **Seasonal glow** — data + `isInSeason` ready; add the animated glow on
  in-season emblems (built-in Animated, like the idle bob).
- **Origin / world-map dimension** — NOT built; needs a new `origin` field on
  `PantryItem` (schema + migration) sourced from OFF `origins_tags` + honor-
  system entry. Keep those rewards personal/cosmetic (unverifiable). See the
  base spec's deferred section.
- **Household co-collecting** — data is already household-scoped; add per-member
  attribution ("Sam found the first Concord grape") off `added_by`. Collaborative,
  never a competitive leaderboard.

## Ship

All JS/TS-only (react-native-svg already a dep; catalog is bundled JSON) → OTA-
eligible, same path as the base feature. Not verified on device (the local sim
crash blocker persists — see the ios-sim run notes).

## Next steps (recommended order)

1. Wire **recipes-within-reach** to the live pantry (cheapest real payoff).
2. **Signature-recipe reveal** on gold (delight, already have the engine).
3. **Seasonal glow** (data ready).
4. Then the bigger bets: **origin** dimension + **household** attribution.

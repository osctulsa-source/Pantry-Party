# Pantry Party curated recipe database

**150 original recipes** (`curated.recipes.json`), easy → medium, owned by the
project — no external recipe API required to serve them.

| | |
|---|---|
| Recipes | 150 (ids `9000001`–`9000150`, contiguous) |
| Meal types | 25 breakfast · 85 main course · 25 dessert · 15 snack |
| Difficulty | 111 easy · 39 medium |
| Dietary | 84 vegetarian · 19 vegan · 57 gluten-free (as written) |
| Steps | 1,075 authored steps (avg 7.2/recipe), each with per-step ingredients / equipment / duration |

## Provenance & licensing (why this is clean)

- **Dish selection** was researched from public popularity signals (most-searched
  and most-popular recipe lists — e.g. BBC Good Food's most-popular dinners,
  2026 most-searched recipe data). *Which dishes people cook* is a fact and not
  copyrightable.
- **Every word is original.** Summaries and instructions were authored for this
  project in the Pantry Party voice (`sourceName: "Pantry Party Kitchen"`).
  Nothing is scraped or paraphrased from any recipe site; no brand names appear.
- **`image` is deliberately `""`** — no photos were copied. An image pass
  (generated food photography or CC-licensed sources with attribution) is a
  separate future task.

## Schema

The shape intentionally matches the app's `SpoonacularRecipe`
(`apps/mobile/src/data/spoonacular/types.ts`) — grouped numbered steps with
per-step `ingredients` / `equipment` / `lengthMinutes` — so **RecipeDetail and
Cook Mode render these with zero client rework**. Three additive fields the
client can use for filtering: `difficulty`, `mealType`, `cuisines`.

Authoring rules + a worked example live in [`SPEC.md`](./SPEC.md).
Fields intentionally fixed in v1: `image: ""`, `healthScore: null`,
`sourceUrl: ""` (ours), `sourceName: "Pantry Party Kitchen"`.

**Id space:** `9000001+` — far above Spoonacular's id range, so anything keyed
on `recipe.id` (favorites, prefs, cook history) can never collide. New batches
continue from `9000151`.

## Validation

```sh
node data/recipes/validate.mjs data/recipes/curated.recipes.json
```

Checks schema conformance, id/title uniqueness, step numbering, step-ingredient
cross-references, dietary-flag consistency (vegan ⇒ vegetarian), and time-budget
sanity. CI-inert today (nothing imports this data yet).

## Integration options (next arc — decide before wiring)

1. **Bundle client-side (recommended v1).** Import the JSON in the app, compute
   `usedIngredientCount` / `missedIngredientNames` against the pantry with the
   existing token matcher (`@breadbox/core` `matchCookedItems` family), and merge
   curated results into the Cook pool with a "Pantry Party Kitchen" badge. Works
   offline; zero quota; ~630KB in-bundle.
2. **Serve from `services/api`.** Merge curated matches into `/recipes/search`
   responses server-side and serve curated ids from `/recipes/:id/instructions`.
   Keeps the bundle slim; central updates without an app release (or ship the
   JSON via EAS Update anyway).
3. **Hybrid**: bundle for offline + server merge for search parity.

## Regenerating / extending

Author new batches against `SPEC.md`, validate, append, and keep ids
sequential. The authoring pipeline (spec → parallel batch authoring →
validator → merge) is documented in the project notes (8 Jul 2026).

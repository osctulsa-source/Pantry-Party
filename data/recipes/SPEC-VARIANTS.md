# Pantry Party device-variant spec (v1) — addendum to SPEC.md

You are authoring DEVICE VARIANTS: alternate instruction sets that convert an
existing curated recipe to a different cooking device. Read SPEC.md first —
every voice and legal rule there applies verbatim.

## Schema (per variant — every field required)

```ts
{
  recipeId: number;           // id of the base recipe in curated.recipes.json
  device: "crockpot" | "instantpot" | "airfryer" | "sheetpan" | "microwave"
        | "nocook" | "stove" | "oven" | "grill" | "griddle";
  readyInMinutes: number;     // realistic total for THIS device, 5-600
  steps: Array<{              // identical step schema to SPEC.md
    number: number;           // 1..N sequential
    step: string;             // one clear action sentence; doneness cues
    ingredients: string[];    // MUST match (or be contained in) a BASE recipe
                              // ingredient name — variants share the base list
    equipment: string[];      // 0-2 items; name the device naturally
                              // ("slow cooker", "air fryer basket")
    lengthMinutes: number | null;  // null or 1-600 (crockpot lows run long)
  }>;                         // 4-12 steps
}
```

## Rules beyond SPEC.md
- The ingredient LIST is shared with the base recipe. If the device needs less
  liquid, say it in the step ("add only half the broth — slow cookers don't
  evaporate"). Never reference an ingredient the base recipe doesn't have.
- One entry per (recipeId, device) pair. Never author a variant for a device
  the base recipe already natively uses.
- Conversions must be genuinely good cooking, never forced. If a dish would be
  bad on a device, skip it — the coverage matrix records the skip.
- `readyInMinutes` reflects reality: crockpot chilis are 360-480, not 45.
- Equipment strings mention the device so keyword detection stays consistent.

## Workflow for your batch
1. Write your JSON array to your assigned file in data/recipes/variants-batches/.
2. Run: `node data/recipes/validate.mjs --variants <your file>` with Bash.
3. Fix every ERROR and re-run until PASS. Then report: variant count,
   any pairings you skipped as not-sensible (with one-line reasons), PASS line.

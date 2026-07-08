# Pantry Party curated recipe spec (v1)

You are authoring ORIGINAL recipes for the Pantry Party app's owned database.
Output: a JSON array of recipe objects, written to your assigned batch file.

## Legal rules (non-negotiable)
- Dish CHOICES are researched from popularity data (facts, fine). Every word of
  the summary and every instruction step must be YOUR OWN original writing.
  Never reproduce text from any recipe website. No brand names in text.
- `image` is always `""` at AUTHORING time (the image pass fills in hosted
  URLs later; the validator accepts "" or an https URL).

## Schema (per recipe — every field required unless noted)

```ts
{
  id: number;                 // your assigned range, sequential, unique
  title: string;              // dish name, title case, no clickbait ("Beef Stroganoff")
  image: "";                  // always empty string in v1
  difficulty: "easy" | "medium";   // as assigned per dish
  mealType: "breakfast" | "main course" | "dessert" | "snack";  // as assigned
  cuisines: string[];         // 0-2 lowercase tags, e.g. ["italian"] — [] if generic
  readyInMinutes: number;     // total realistic time, 5-180
  servings: number;           // 1-12
  vegetarian: boolean;        // accurate for the recipe as written
  vegan: boolean;             // vegan implies vegetarian
  glutenFree: boolean;        // accurate as written (soy sauce = NOT gluten-free)
  healthScore: null;          // always null in v1 (we don't fabricate scores)
  sourceUrl: "";              // always empty (it's ours)
  sourceName: "Pantry Party Kitchen";
  summary: string;            // 1-2 sentences, plain text, warm + confident, max 220 chars
  ingredients: Array<{
    name: string;             // simple lowercase ingredient name ("chicken thighs")
    original: string;         // the display line ("1 lb boneless chicken thighs")
    amount: number | null;    // numeric part (1, 0.5, 2) or null if "to taste"
    unit: string;             // "lb", "cup", "tbsp", "" for count/to-taste
  }>;                         // 3-14 items, realistic amounts
  instructions: [{            // EXACTLY one group
    name: "";
    steps: Array<{
      number: number;         // 1..N sequential
      step: string;           // ONE clear action sentence or two short ones.
                              // Novice-friendly: include doneness cues
                              // ("until golden, about 3 minutes").
      ingredients: string[];  // lowercase names of THIS step's ingredients —
                              // each MUST match (or contain) an ingredients[].name.
                              // [] for steps using nothing new.
      equipment: string[];    // 0-2 simple items ("large skillet", "whisk"), lowercase
      lengthMinutes: number | null;  // only when the step has a real wait/cook time
    }>;                       // 4-10 steps for easy, 5-12 for medium
  }];
}
```

## Voice (Pantry Party Kitchen)
Calm, warm, zero pretension. Written for someone slightly nervous in a kitchen:
say what to look/listen/smell for, never assume technique names ("fold" → say
how). Steps are imperative and short. The summary sells the outcome ("Crispy
edges, custardy middle — the diner classic, minus the diner."), never lists
ingredients.

## Quality bar per recipe
- Amounts must be internally consistent (if a step uses 2 batches of butter,
  ingredients list must cover it).
- Every ingredient appears in at least one step's `ingredients` array.
- Salt/pepper allowed as `amount: null, unit: "", original: "salt and pepper to taste"`.
- Realistic times: readyInMinutes ≈ sum of step lengthMinutes + prep slack.
- JSON only in the output file: ASCII straight quotes, no comments, no trailing commas.

## Complete example (match this quality and shape exactly)

```json
{
  "id": 9999999,
  "title": "Garlic Butter Shrimp",
  "image": "",
  "difficulty": "easy",
  "mealType": "main course",
  "cuisines": [],
  "readyInMinutes": 15,
  "servings": 4,
  "vegetarian": false,
  "vegan": false,
  "glutenFree": true,
  "healthScore": null,
  "sourceUrl": "",
  "sourceName": "Pantry Party Kitchen",
  "summary": "Ten minutes from fridge to table, and it tastes like you fussed. Sweet shrimp in a garlicky butter sauce you will want bread for.",
  "ingredients": [
    { "name": "shrimp", "original": "1 lb large shrimp, peeled and deveined", "amount": 1, "unit": "lb" },
    { "name": "butter", "original": "4 tbsp butter", "amount": 4, "unit": "tbsp" },
    { "name": "garlic", "original": "4 cloves garlic, minced", "amount": 4, "unit": "" },
    { "name": "lemon", "original": "1 lemon, juiced", "amount": 1, "unit": "" },
    { "name": "parsley", "original": "2 tbsp chopped fresh parsley", "amount": 2, "unit": "tbsp" },
    { "name": "red pepper flakes", "original": "a pinch of red pepper flakes (optional)", "amount": null, "unit": "" },
    { "name": "salt", "original": "salt to taste", "amount": null, "unit": "" }
  ],
  "instructions": [
    {
      "name": "",
      "steps": [
        { "number": 1, "step": "Pat the shrimp dry with paper towels and season lightly with salt — dry shrimp brown instead of steaming.", "ingredients": ["shrimp", "salt"], "equipment": ["paper towels"], "lengthMinutes": null },
        { "number": 2, "step": "Melt half the butter in a large skillet over medium-high heat until it foams.", "ingredients": ["butter"], "equipment": ["large skillet"], "lengthMinutes": 1 },
        { "number": 3, "step": "Add the shrimp in a single layer and cook until pink and curled, about 2 minutes per side. Move them to a plate.", "ingredients": ["shrimp"], "equipment": [], "lengthMinutes": 4 },
        { "number": 4, "step": "Turn the heat to medium, add the rest of the butter, the garlic, and the red pepper flakes, and stir just until fragrant — about 30 seconds. Do not let the garlic brown.", "ingredients": ["butter", "garlic", "red pepper flakes"], "equipment": [], "lengthMinutes": 1 },
        { "number": 5, "step": "Return the shrimp to the pan, squeeze in the lemon juice, and toss everything to coat.", "ingredients": ["shrimp", "lemon"], "equipment": [], "lengthMinutes": 1 },
        { "number": 6, "step": "Scatter the parsley over the top and serve straight from the pan.", "ingredients": ["parsley"], "equipment": [], "lengthMinutes": null }
      ]
    }
  ]
}
```

## Workflow for your batch
1. Write your full JSON array to your assigned file with the Write tool.
2. Run: `node /agent/workspace/recipedb/validate.mjs <your file>` with Bash.
3. Fix every ERROR it reports and re-run until it prints PASS (warnings are
   acceptable if justified). Then report: count, any dishes you adapted, PASS line.

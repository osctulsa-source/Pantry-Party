import { describe, expect, it } from "vitest";

import { EMPTY_TASTE_PROFILE, type TasteProfile } from "./tasteProfile.ts";
import { hasDietLines, passesDiet, recipeViolations, type DietCheckRecipe } from "./dietFilter.ts";

const profile = (over: Partial<TasteProfile>): TasteProfile => ({ ...EMPTY_TASTE_PROFILE, ...over });
const recipe = (over: Partial<DietCheckRecipe>): DietCheckRecipe => ({
  vegetarian: null, vegan: null, glutenFree: null, ingredientNames: [], ...over,
});

describe("hasDietLines", () => {
  it("is false for an empty profile and true with any diet or allergy", () => {
    expect(hasDietLines(EMPTY_TASTE_PROFILE)).toBe(false);
    expect(hasDietLines(profile({ diets: ["vegan"] }))).toBe(true);
    expect(hasDietLines(profile({ allergies: ["shellfish"] }))).toBe(true);
  });
});

describe("flag-backed diets", () => {
  it("vegetarian requires the flag to be strictly true", () => {
    const p = profile({ diets: ["vegetarian"] });
    expect(recipeViolations(p, recipe({ vegetarian: true }))).toEqual([]);
    expect(recipeViolations(p, recipe({ vegetarian: false }))).toEqual(["vegetarian"]);
    expect(recipeViolations(p, recipe({ vegetarian: null }))).toEqual(["vegetarian"]);
  });

  it("vegan and gluten-free behave the same way", () => {
    expect(passesDiet(profile({ diets: ["vegan"] }), recipe({ vegan: true }))).toBe(true);
    expect(passesDiet(profile({ diets: ["vegan"] }), recipe({ vegan: false }))).toBe(false);
    expect(passesDiet(profile({ diets: ["gluten-free"] }), recipe({ glutenFree: true }))).toBe(true);
    expect(passesDiet(profile({ diets: ["gluten-free"] }), recipe({}))).toBe(false);
  });
});

describe("keyword-backed lines", () => {
  it("dairy-free catches dairy ingredients", () => {
    const p = profile({ diets: ["dairy-free"] });
    expect(passesDiet(p, recipe({ ingredientNames: ["unsalted butter"] }))).toBe(false);
    expect(passesDiet(p, recipe({ ingredientNames: ["olive oil", "basil"] }))).toBe(true);
  });

  it("nut-free catches nuts but not nutmeg or butternut squash", () => {
    const p = profile({ diets: ["nut-free"] });
    expect(passesDiet(p, recipe({ ingredientNames: ["roasted peanuts"] }))).toBe(false);
    expect(passesDiet(p, recipe({ ingredientNames: ["almond flour"] }))).toBe(false);
    expect(passesDiet(p, recipe({ ingredientNames: ["nutmeg", "butternut squash"] }))).toBe(true);
  });

  it("each allergen list hits its ingredients", () => {
    expect(passesDiet(profile({ allergies: ["egg"] }), recipe({ ingredientNames: ["2 eggs"] }))).toBe(false);
    expect(passesDiet(profile({ allergies: ["soy"] }), recipe({ ingredientNames: ["firm tofu"] }))).toBe(false);
    expect(passesDiet(profile({ allergies: ["fish"] }), recipe({ ingredientNames: ["salmon fillet"] }))).toBe(false);
    expect(passesDiet(profile({ allergies: ["shellfish"] }), recipe({ ingredientNames: ["jumbo shrimp"] }))).toBe(false);
    expect(passesDiet(profile({ allergies: ["egg", "soy", "fish", "shellfish"] }), recipe({ ingredientNames: ["chicken breast", "rice"] }))).toBe(true);
  });

  it("vegan backstops dairy and egg keywords even when the flag lies", () => {
    const p = profile({ diets: ["vegan"] });
    expect(recipeViolations(p, recipe({ vegan: true, ingredientNames: ["heavy cream"] }))).toEqual(["vegan"]);
    expect(recipeViolations(p, recipe({ vegan: true, ingredientNames: ["egg yolk"] }))).toEqual(["vegan"]);
  });

  it("documents the conservative edge: eggplant trips the egg list", () => {
    expect(passesDiet(profile({ allergies: ["egg"] }), recipe({ ingredientNames: ["eggplant"] }))).toBe(false);
  });

  it("shellfish catches crawfish and crayfish (regression: under-hide gap)", () => {
    const p = profile({ allergies: ["shellfish"] });
    expect(passesDiet(p, recipe({ ingredientNames: ["crawfish tails"] }))).toBe(false);
    expect(passesDiet(p, recipe({ ingredientNames: ["crayfish"] }))).toBe(false);
  });

  it("dairy-free catches hidden dairy: whey and caseinate", () => {
    const p = profile({ diets: ["dairy-free"] });
    expect(passesDiet(p, recipe({ ingredientNames: ["whey protein isolate"] }))).toBe(false);
    expect(passesDiet(p, recipe({ ingredientNames: ["sodium caseinate"] }))).toBe(false);
  });

  it("reports every violated slug", () => {
    const p = profile({ diets: ["vegetarian", "dairy-free"], allergies: ["shellfish"] });
    const r = recipe({ vegetarian: false, ingredientNames: ["shrimp", "butter"] });
    expect(recipeViolations(p, r).sort()).toEqual(["dairy-free", "shellfish", "vegetarian"]);
  });
});

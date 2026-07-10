import { describe, expect, it } from "vitest";

import { parseShoppingListItem, titleCaseIngredient } from "./shoppingList.ts";

describe("ShoppingListItem", () => {
  const validItem = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    householdId: "223e4567-e89b-12d3-a456-426614174000",
    name: "Milk",
    quantity: 2,
    unit: "ct",
    note: "Buy organic if possible",
    checked: false,
    source: "manual",
    addedBy: "user-1",
    addedAt: "2026-06-30T12:00:00.000Z",
    updatedAt: Date.now(),
    deleted: false,
  };

  it("validates a correct shopping list item successfully", () => {
    const parsed = parseShoppingListItem(validItem);
    expect(parsed).toEqual(validItem);
  });

  it("throws validation error if ID is not a UUID", () => {
    const invalid = { ...validItem, id: "not-a-uuid" };
    expect(() => parseShoppingListItem(invalid)).toThrow();
  });

  it("throws validation error if householdId is not a UUID", () => {
    const invalid = { ...validItem, householdId: "not-a-uuid" };
    expect(() => parseShoppingListItem(invalid)).toThrow();
  });

  it("throws validation error if name is empty", () => {
    const invalid = { ...validItem, name: "" };
    expect(() => parseShoppingListItem(invalid)).toThrow();
  });

  it("throws validation error if quantity is negative", () => {
    const invalid = { ...validItem, quantity: -1 };
    expect(() => parseShoppingListItem(invalid)).toThrow();
  });

  it("throws validation error if source is invalid", () => {
    const invalid = { ...validItem, source: "invalid-source" };
    expect(() => parseShoppingListItem(invalid)).toThrow();
  });
});

describe("titleCaseIngredient", () => {
  it("title-cases plain lowercase ingredient names", () => {
    expect(titleCaseIngredient("olive oil")).toBe("Olive Oil");
    expect(titleCaseIngredient("chicken breast")).toBe("Chicken Breast");
  });

  it("keeps small words lowercase unless they lead", () => {
    expect(titleCaseIngredient("cream of tartar")).toBe("Cream of Tartar");
    expect(titleCaseIngredient("salt and pepper")).toBe("Salt and Pepper");
    expect(titleCaseIngredient("the works seasoning")).toBe("The Works Seasoning");
  });

  it("leaves words that already contain uppercase untouched", () => {
    expect(titleCaseIngredient("Parmesan cheese")).toBe("Parmesan Cheese");
    expect(titleCaseIngredient("BBQ sauce")).toBe("BBQ Sauce");
  });

  it("trims and collapses whitespace", () => {
    expect(titleCaseIngredient("  green   beans ")).toBe("Green Beans");
  });

  it("handles single words and empty strings", () => {
    expect(titleCaseIngredient("eggs")).toBe("Eggs");
    expect(titleCaseIngredient("")).toBe("");
    expect(titleCaseIngredient("   ")).toBe("");
  });
});

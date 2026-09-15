import { describe, expect, it } from "vitest";

import { looksLikeGroceryOrderDump, parseGroceryPaste } from "./groceryPaste.ts";

/** Reconstructed clipboard from the 2026-09-14 Instacart delivered-order screenshot. */
const INSTACART_ORDER_DUMP = `
Found (9)
Diet Coke Soda
1
$7.57
$7.57 · each
All Natural* 80% Lean/20% Fat Ground Beef Chuck Tray, 1 lb
1
$7.23
$7.23 · each
Similac 360 Total Care Infant Formula Powder With 5 HMO Prebiotics
1
$49.97
$49.97 · each
Hormel Hard Salami & Pepperoni Party Tray
1
$14.97
$14.97 · each
Great Value 2% Reduced Fat Milk
1
$2.02
$2.02 · each
Organic Bananas
2.4 lb
$1.78
$0.74/lb · 2.4 lb
~ Weight decreased from 2.49 lb
Lay's Potato Chips Honey Barbecue
1
$2.50
$2.50 · each
Lay's Potato Chips, Salt & Vinegar Flavored
1
$2.50
$2.50 · each
Kellogg's Frosted Mini-Wheats Original Breakfast Cereal, 48g Whole Grain, Family Size
1
$4.98
$4.98 · each
`.trim();

describe("parseGroceryPaste", () => {
  it("parses an Instacart order dump into nine items with sold-by-weight bananas", () => {
    const result = parseGroceryPaste(INSTACART_ORDER_DUMP);
    expect(result.lookedLikeOrder).toBe(true);
    expect(result.items).toEqual([
      { name: "Diet Coke Soda", quantity: 1, unit: null },
      {
        name: "All Natural* 80% Lean/20% Fat Ground Beef Chuck Tray, 1 lb",
        quantity: 1,
        unit: null,
      },
      {
        name: "Similac 360 Total Care Infant Formula Powder With 5 HMO Prebiotics",
        quantity: 1,
        unit: null,
      },
      {
        name: "Hormel Hard Salami & Pepperoni Party Tray",
        quantity: 1,
        unit: null,
      },
      { name: "Great Value 2% Reduced Fat Milk", quantity: 1, unit: null },
      { name: "Organic Bananas", quantity: 2.4, unit: "lb" },
      { name: "Lay's Potato Chips Honey Barbecue", quantity: 1, unit: null },
      {
        name: "Lay's Potato Chips, Salt & Vinegar Flavored",
        quantity: 1,
        unit: null,
      },
      {
        name: "Kellogg's Frosted Mini-Wheats Original Breakfast Cereal, 48g Whole Grain, Family Size",
        quantity: 1,
        unit: null,
      },
    ]);
  });

  it("treats a comma-separated typed list as qty-1 rows", () => {
    const result = parseGroceryPaste("Milk, Eggs");
    expect(result.lookedLikeOrder).toBe(false);
    expect(result.items).toEqual([
      { name: "Milk", quantity: 1, unit: null },
      { name: "Eggs", quantity: 1, unit: null },
    ]);
  });

  it("splits a newline-only typed list", () => {
    const result = parseGroceryPaste("Milk\nEggs\nPenne pasta");
    expect(result.lookedLikeOrder).toBe(false);
    expect(result.items.map((i) => i.name)).toEqual(["Milk", "Eggs", "Penne pasta"]);
  });

  it("returns no items for chrome-and-prices-only paste", () => {
    const result = parseGroceryPaste("Found (9)\n$7.57 · each\nThank you");
    expect(result.lookedLikeOrder).toBe(true);
    expect(result.items).toEqual([]);
  });

  it("truncates an order dump at the limit", () => {
    const result = parseGroceryPaste(INSTACART_ORDER_DUMP, { limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.name).toBe("Diet Coke Soda");
    expect(result.items[1]?.name).toBe(
      "All Natural* 80% Lean/20% Fat Ground Beef Chuck Tray, 1 lb",
    );
  });

  it("uses a following integer quantity line", () => {
    const result = parseGroceryPaste("Sparkling Water\n2\n$3.00\n$1.50 · each");
    expect(result.items).toEqual([{ name: "Sparkling Water", quantity: 2, unit: null }]);
  });

  it("dedupes a typed list case-insensitively", () => {
    const result = parseGroceryPaste("Milk\nmilk\nEggs");
    expect(result.items.map((i) => i.name)).toEqual(["Milk", "Eggs"]);
  });

  it("treats Instacart chrome as an order dump even without a lone $ line", () => {
    expect(looksLikeGroceryOrderDump("Found (9)\nDiet Coke")).toBe(true);
    expect(looksLikeGroceryOrderDump("$7.57 · each")).toBe(true);
    expect(looksLikeGroceryOrderDump("MILK 2%           3.49")).toBe(false);
    expect(looksLikeGroceryOrderDump("Subtotal $12.00")).toBe(false);
  });
});

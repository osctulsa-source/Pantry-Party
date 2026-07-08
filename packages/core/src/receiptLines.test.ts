import { describe, expect, it } from "vitest";

import { isReceiptNoiseLine, normalizeReceiptLine, parseReceiptText } from "./receiptLines.ts";
import { detectFavoriteStore } from "./receiptStoreHints.ts";

describe("normalizeReceiptLine", () => {
  it("strips sizes, prices, and store prefixes", () => {
    expect(normalizeReceiptLine("ORG BABY SPINACH 5OZ $3.99")).toBe("Baby Spinach");
    expect(normalizeReceiptLine("GV MILK 1GAL 4.29")).toBe("Milk");
  });

  it("returns null for noise lines", () => {
    expect(normalizeReceiptLine("SUBTOTAL")).toBeNull();
    expect(normalizeReceiptLine("12")).toBeNull();
  });
});

describe("parseReceiptText", () => {
  it("dedupes case-insensitively and caps count", () => {
    const raw = "Milk\nmilk\nEggs\nSUBTOTAL $12.00";
    expect(parseReceiptText(raw).items).toEqual(["Milk", "Eggs"]);
  });

  it("flags receipt noise", () => {
    expect(isReceiptNoiseLine("Thank you for shopping")).toBe(true);
    expect(isReceiptNoiseLine("Bananas")).toBe(false);
  });

  it("detects a favorite store from the receipt header", () => {
    const raw = "KROGER\n123 Main St\nMilk 3.99\nEggs 4.50\nSUBTOTAL";
    const result = parseReceiptText(raw, {
      favoriteStores: [{ id: "kroger", name: "Kroger" }],
    });
    expect(result.detectedStore).toEqual({ id: "kroger", name: "Kroger" });
    expect(result.items).toEqual(["Milk", "Eggs"]);
  });

  it("filters walmart header noise when walmart is a favorite", () => {
    const raw = "WALMART SUPERCENTER\nStore #1234\nGV MILK 1GAL 3.48\nBananas";
    const result = parseReceiptText(raw, {
      favoriteStores: [{ id: "walmart", name: "Walmart" }],
    });
    expect(result.detectedStore?.id).toBe("walmart");
    expect(result.items).toEqual(["Milk", "Bananas"]);
  });

  it("matches custom local store names", () => {
    const raw = "Joe's Market on 5th\nBread 2.99";
    const fav = { id: "custom:joes-market-on-5th", name: "Joe's Market on 5th" };
    expect(detectFavoriteStore(raw, [fav])).toEqual(fav);
  });
});

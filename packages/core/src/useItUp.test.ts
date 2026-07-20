import { describe, expect, it } from "vitest";

import { formatUseItUpBadge, scoreUseItUp, type UrgentMatch } from "./useItUp.ts";

// Fixed clock: 2026-07-10T12:00:00Z. Expiry dates are date-only ISO strings
// (parse as UTC midnight), matching how the app stores expiresAt.
const NOW = new Date("2026-07-10T12:00:00Z");

function pantry(name: string, expiresAt?: string) {
  return { name, expiresAt };
}

describe("scoreUseItUp", () => {
  it("scores 3 for an item expiring within a day, counting calendar days", () => {
    const { score, urgentMatches } = scoreUseItUp(
      ["chicken breast"],
      [pantry("Chicken", "2026-07-11")],
      NOW,
    );
    expect(score).toBe(3);
    // NOW is 2026-07-10 noon; a 2026-07-11 expiry is the NEXT calendar day, so
    // daysLeft is 1 ("tomorrow"), matching the pantry pill — not 0, which the
    // old fractional floor produced (12h < 1 day) and which read "expires today".
    expect(urgentMatches).toEqual([{ itemName: "Chicken", daysLeft: 1, status: "warning" }]);
  });

  it("reports 0 calendar days only for an item expiring on today's date", () => {
    const { urgentMatches } = scoreUseItUp(
      ["chicken breast"],
      [pantry("Chicken", "2026-07-10")],
      NOW,
    );
    expect(urgentMatches).toEqual([{ itemName: "Chicken", daysLeft: 0, status: "warning" }]);
  });

  it("scores 2 in the 2–3 day warning band and 1 in the 4–7 day band", () => {
    expect(scoreUseItUp(["milk"], [pantry("Milk", "2026-07-13")], NOW).score).toBe(2);
    expect(scoreUseItUp(["milk"], [pantry("Milk", "2026-07-16")], NOW).score).toBe(1);
  });

  it("scores 2 for expired items with status 'expired'", () => {
    const { score, urgentMatches } = scoreUseItUp(
      ["spinach"],
      [pantry("Spinach", "2026-07-08")],
      NOW,
    );
    expect(score).toBe(2);
    expect(urgentMatches[0].status).toBe("expired");
    expect(urgentMatches[0].daysLeft).toBeLessThan(0);
  });

  it("scores 0 beyond 7 days, without expiresAt, and on invalid dates", () => {
    expect(scoreUseItUp(["milk"], [pantry("Milk", "2026-07-30")], NOW).score).toBe(0);
    expect(scoreUseItUp(["milk"], [pantry("Milk")], NOW).score).toBe(0);
    expect(scoreUseItUp(["milk"], [pantry("Milk", "not a date")], NOW).score).toBe(0);
    expect(scoreUseItUp(["milk"], [pantry("Milk", "2026-07-30")], NOW).urgentMatches).toEqual([]);
  });

  it("matches via token normalization (plurals, descriptors)", () => {
    // "Tomatoes" (pantry) matches "diced tomato" (ingredient); "fresh" is a stop word.
    const { score } = scoreUseItUp(
      ["fresh diced tomato"],
      [pantry("Tomatoes", "2026-07-11")],
      NOW,
    );
    expect(score).toBe(3);
  });

  it("counts each pantry item once even when several ingredients match it", () => {
    const { score } = scoreUseItUp(
      ["chicken breast", "chicken broth"],
      [pantry("Chicken", "2026-07-11")],
      NOW,
    );
    expect(score).toBe(3);
  });

  it("sums multiple urgent items, capped at 6, sorted most-urgent-first", () => {
    const { score, urgentMatches } = scoreUseItUp(
      ["chicken", "milk", "spinach"],
      [
        pantry("Milk", "2026-07-13"), // 2 pts, 2 days
        pantry("Chicken", "2026-07-11"), // 3 pts, 0 days
        pantry("Spinach", "2026-07-11"), // 3 pts, 0 days → raw 8, capped
      ],
      NOW,
    );
    expect(score).toBe(6);
    expect(urgentMatches.map((m: UrgentMatch) => m.itemName)).toEqual([
      "Chicken",
      "Spinach",
      "Milk",
    ]);
  });

  it("returns zero for empty inputs", () => {
    expect(scoreUseItUp([], [pantry("Milk", "2026-07-11")], NOW).score).toBe(0);
    expect(scoreUseItUp(["milk"], [], NOW).score).toBe(0);
  });
});

describe("formatUseItUpBadge", () => {
  const m = (itemName: string, daysLeft: number, status: UrgentMatch["status"]): UrgentMatch => ({
    itemName,
    daysLeft,
    status,
  });

  it("returns null for no matches", () => {
    expect(formatUseItUpBadge([])).toBeNull();
  });

  it("formats each urgency band, lowercasing the item name", () => {
    expect(formatUseItUpBadge([m("Spinach", -2, "expired")])).toBe("Use it up: spinach · expired");
    expect(formatUseItUpBadge([m("Chicken", 0, "warning")])).toBe(
      "Use it up: chicken · expires today",
    );
    expect(formatUseItUpBadge([m("Chicken", 1, "warning")])).toBe(
      "Use it up: chicken · 1 day left",
    );
    expect(formatUseItUpBadge([m("Milk", 3, "warning")])).toBe("Use it up: milk · 3 days left");
  });

  it("appends a +N more suffix for multiple matches", () => {
    expect(formatUseItUpBadge([m("Chicken", 0, "warning"), m("Milk", 3, "warning")])).toBe(
      "Use it up: chicken · expires today +1 more",
    );
    expect(
      formatUseItUpBadge([
        m("Chicken", 0, "warning"),
        m("Milk", 3, "warning"),
        m("Spinach", 5, "soon"),
      ]),
    ).toBe("Use it up: chicken · expires today +2 more");
  });
});

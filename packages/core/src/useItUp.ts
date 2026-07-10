/**
 * "Use it up" — expiry-aware recipe urgency scoring. Pure functions, no I/O.
 *
 * Answers: how urgently does THIS recipe help the user consume pantry items
 * that are about to expire? The Cook tab folds the score into its ranking
 * blend and shows the badge so the boost is explainable, never mysterious.
 *
 * Matching reuses normalizeFoodTokens from cooked.ts — the same recipe/pantry
 * pair must match here exactly as it does in the cooked-it decrement sheet.
 * Consistency beats cleverness (see cooked.ts module doc).
 *
 * Weights are deliberately coarse bands on days-until-expiry; the cap keeps a
 * fridge full of wilting produce from drowning the taste signal entirely.
 */

import { normalizeFoodTokens } from "./cooked.ts";

export interface UrgentMatch {
  /** Pantry item's display name (as stored). */
  itemName: string;
  /** Whole days until expiry (floor). Negative when already expired. */
  daysLeft: number;
  status: "expired" | "warning" | "soon";
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** One recipe can't run away from the taste signal on urgency alone. */
const SCORE_CAP = 6;

/** Days-until-expiry → urgency points. 0 = not urgent. */
function urgencyWeight(daysLeft: number): number {
  if (daysLeft < 0) return 2; // expired — still worth surfacing, below "today"
  if (daysLeft <= 1) return 3; // today / tomorrow
  if (daysLeft <= 3) return 2; // the expiry warning window
  if (daysLeft <= 7) return 1; // this week
  return 0;
}

function statusFor(daysLeft: number): UrgentMatch["status"] {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 3) return "warning";
  return "soon";
}

/**
 * Score how urgently a recipe consumes expiring pantry items.
 *
 * Each pantry item that (a) token-matches any used ingredient and (b) expires
 * within 7 days contributes its urgency weight once — even if several
 * ingredients match it. `urgentMatches` is sorted most-urgent-first
 * (fewest daysLeft; input order breaks ties). Items without a parseable
 * expiresAt never contribute (same policy as getExpiryStatus).
 */
export function scoreUseItUp(
  usedIngredientNames: string[],
  pantryItems: Array<{ name: string; expiresAt?: string }>,
  now: Date,
): { score: number; urgentMatches: UrgentMatch[] } {
  const ingredientTokens = new Set(
    usedIngredientNames.flatMap((n) => normalizeFoodTokens(n)),
  );
  if (ingredientTokens.size === 0) return { score: 0, urgentMatches: [] };

  const matches: UrgentMatch[] = [];
  let raw = 0;
  for (const item of pantryItems) {
    if (!item.expiresAt) continue;
    const expiry = new Date(item.expiresAt);
    if (Number.isNaN(expiry.getTime())) continue;
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / MS_PER_DAY);
    const weight = urgencyWeight(daysLeft);
    if (weight === 0) continue;
    if (!normalizeFoodTokens(item.name).some((t) => ingredientTokens.has(t))) continue;
    raw += weight;
    matches.push({ itemName: item.name, daysLeft, status: statusFor(daysLeft) });
  }
  matches.sort((a, b) => a.daysLeft - b.daysLeft);
  return { score: Math.min(raw, SCORE_CAP), urgentMatches: matches };
}

/**
 * Card badge for the most urgent match, e.g. "Use it up: chicken · 2 days
 * left" (+ " +1 more" when several items are urgent). Null when nothing is.
 * Item names render lowercase to match the header reason line's style.
 */
export function formatUseItUpBadge(matches: UrgentMatch[]): string | null {
  const top = matches[0];
  if (!top) return null;
  const when =
    top.status === "expired"
      ? "expired"
      : top.daysLeft === 0
        ? "expires today"
        : top.daysLeft === 1
          ? "1 day left"
          : `${top.daysLeft} days left`;
  const extra = matches.length > 1 ? ` +${matches.length - 1} more` : "";
  return `Use it up: ${top.itemName.toLowerCase()} · ${when}${extra}`;
}

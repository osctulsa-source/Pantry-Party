/**
 * Grocery paste parsing — typed lists and priced order dumps (Instacart, etc.).
 *
 * Distinct from `parseReceiptText`, which returns names only and strips size
 * tokens. This parser keeps sold-by-weight quantities (e.g. 2.4 lb bananas).
 */

import { UNITS } from "./schema.ts";

const DEFAULT_LIMIT = 50;

export interface GroceryPasteItem {
  name: string;
  quantity: number;
  /** Canonical unit when the order sold by weight (e.g. `lb`); null for counts. */
  unit: string | null;
}

export interface GroceryPasteResult {
  items: GroceryPasteItem[];
  /** True when the blob looked like a priced order dump, not a typed list. */
  lookedLikeOrder: boolean;
}

export interface GroceryPasteOptions {
  limit?: number;
}

const PRICE_TOKEN = /\$\d+\.\d{2}/;
const FOUND_HEADER = /Found\s*\(/i;
const MIDDOT_EACH = /·\s*each/i;
const PRICE_PER_LB = /\$[\d.]+\s*\/\s*lb/i;

const NOISE =
  /\b(thank you|delivery details|family order|your order was delivered|weight decreased|found\s*\()\b/i;

/** Footer totals — whole line only; `Total Care` in a product title is not noise. */
const FOOTER_TOTAL = /^(subtotal|total|tax|change)\b/i;

/** Addresses like `5214 South Delaware Place` — not the word `Place` in a title. */
const STREET = /^\d+\s+.*\b(street|st\.|avenue|ave\.|boulevard|blvd|place|drive|rd\.|road)\b/i;

const UNIT_BODY = "lb|lbs|oz|ct|g|kg|ml|l|cup|tbsp|tsp";
const QTY_WITH_UNIT = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${UNIT_BODY})$`, "i");
const QTY_BARE = /^\d+(?:\.\d+)?$/;

/**
 * Instacart-style order chrome — used by screenshot OCR so a paper receipt
 * that merely contains `$3.49` does not steal the sold-by-weight parser.
 */
export function looksLikeGroceryOrderDump(raw: string): boolean {
  return FOUND_HEADER.test(raw) || MIDDOT_EACH.test(raw) || PRICE_PER_LB.test(raw);
}

function looksLikeOrderDump(raw: string): boolean {
  return looksLikeGroceryOrderDump(raw) || PRICE_TOKEN.test(raw);
}

function canonicalUnit(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (lower === "lbs") return "lb";
  if (lower === "l") return "L";
  return (UNITS as readonly string[]).includes(lower) ? lower : null;
}

function letterCount(text: string): number {
  return (text.match(/[A-Za-z]/g) ?? []).length;
}

type LineKind = "noise" | "price" | "quantity" | "product";

function classifyLine(raw: string): LineKind | { kind: "quantity"; quantity: number; unit: string | null } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "noise";
  if (trimmed.startsWith("~")) return "noise";
  if (/^receipt$/i.test(trimmed)) return "noise";
  if (NOISE.test(trimmed) || FOOTER_TOTAL.test(trimmed) || STREET.test(trimmed)) return "noise";

  const qtyUnit = trimmed.match(QTY_WITH_UNIT);
  if (qtyUnit) {
    const quantity = Number(qtyUnit[1]);
    const unit = canonicalUnit(qtyUnit[2] ?? "");
    return { kind: "quantity", quantity, unit };
  }
  if (QTY_BARE.test(trimmed)) {
    return { kind: "quantity", quantity: Number(trimmed), unit: null };
  }

  const withoutPrices = trimmed.replace(/\$\d+\.\d{2}/g, "").replace(/·/g, " ").trim();
  if (PRICE_TOKEN.test(trimmed) && letterCount(withoutPrices) < 3) return "price";
  if (MIDDOT_EACH.test(trimmed) || PRICE_PER_LB.test(trimmed)) return "price";

  if (letterCount(trimmed) < 3) return "noise";
  return "product";
}

function normalizeName(raw: string, maxLen: number): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function parsePlainList(raw: string, limit: number): GroceryPasteItem[] {
  const seen = new Set<string>();
  const items: GroceryPasteItem[] = [];
  for (const piece of raw.split(/[\n,;]+/)) {
    const name = normalizeName(piece, 100);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    items.push({ name, quantity: 1, unit: null });
    if (items.length >= limit) break;
  }
  return items;
}

function parseOrderDump(raw: string, limit: number): GroceryPasteItem[] {
  const items: GroceryPasteItem[] = [];
  let pending: string | null = null;

  const flush = (quantity: number, unit: string | null) => {
    if (!pending || items.length >= limit) {
      pending = null;
      return;
    }
    items.push({ name: pending, quantity, unit });
    pending = null;
  };

  for (const line of raw.split(/\n/)) {
    if (items.length >= limit && pending === null) break;
    const kind = classifyLine(line);
    if (kind === "noise" || kind === "price") continue;
    if (kind === "product") {
      if (pending) flush(1, null);
      if (items.length >= limit) break;
      pending = normalizeName(line, 120);
      continue;
    }
    if (typeof kind === "object" && kind.kind === "quantity") {
      if (pending) flush(kind.quantity, kind.unit);
    }
  }
  if (pending && items.length < limit) flush(1, null);
  return items;
}

export function parseGroceryPaste(
  raw: string,
  options: GroceryPasteOptions = {},
): GroceryPasteResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const lookedLikeOrder = looksLikeOrderDump(raw);
  const items = lookedLikeOrder ? parseOrderDump(raw, limit) : parsePlainList(raw, limit);
  return { items, lookedLikeOrder };
}

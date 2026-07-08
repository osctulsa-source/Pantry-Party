/**
 * Receipt / label line parsing — turns noisy OCR text into pantry item names.
 *
 * Used by the text-capture flow (on-device OCR). Favorite stores from Settings
 * tune header detection and chain-specific noise stripping.
 */

import {
  detectFavoriteStore,
  isReceiptHeaderLine,
  noisePatternsForStore,
  type FavoriteStoreHint,
} from "./receiptStoreHints.ts";

const RECEIPT_NOISE =
  /\b(subtotal|total|tax|change|cash|visa|mastercard|debit|credit|auth|approval|balance|savings|coupon|member|receipt|thank you|visit|www\.|http)\b/i;

const SIZE_TOKEN = /\b\d+(\.\d+)?\s?(oz|lb|lbs|gal|ct|pk|g|kg|ml|l|fl oz)\b/gi;
const PRICE_TOKEN = /\$?\d+\.\d{2}/g;
const STORE_PREFIX = /\b(org|gv|great value|ks|kirkland|365)\b/gi;

export interface ReceiptParseOptions {
  limit?: number;
  favoriteStores?: FavoriteStoreHint[];
}

export interface ReceiptParseResult {
  items: string[];
  detectedStore: FavoriteStoreHint | null;
}

export interface ReceiptLineContext {
  storeId: string | null;
  extraNoise: RegExp[];
}

function buildLineContext(
  raw: string,
  favoriteStores: FavoriteStoreHint[],
): ReceiptLineContext {
  const detected = detectFavoriteStore(raw, favoriteStores);
  return {
    storeId: detected?.id ?? null,
    extraNoise: noisePatternsForStore(detected?.id ?? null),
  };
}

/** Lines that are almost never grocery items on a receipt. */
export function isReceiptNoiseLine(raw: string, ctx?: ReceiptLineContext): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 3) return true;
  if (RECEIPT_NOISE.test(trimmed)) return true;
  if (/^\d+$/.test(trimmed)) return true;
  if (/^[*#\-_=]+$/.test(trimmed)) return true;
  if (ctx?.extraNoise.some((re) => re.test(trimmed))) return true;
  return false;
}

/**
 * Normalize one OCR line into a display-ready product name, or null if junk.
 * Title-cases the result for pantry display.
 */
export function normalizeReceiptLine(
  rawText: string,
  ctx?: ReceiptLineContext,
): string | null {
  const cleaned = rawText
    .replace(SIZE_TOKEN, "")
    .replace(PRICE_TOKEN, "")
    .replace(STORE_PREFIX, "")
    .replace(/[^a-zA-Z0-9\s&'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 3) return null;
  if (isReceiptNoiseLine(cleaned, ctx)) return null;

  return cleaned
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse raw OCR output into deduped item names (max `limit`).
 * Splits on newlines first; falls back to comma/semicolon for pasted blobs.
 */
export function parseReceiptText(
  raw: string,
  options: ReceiptParseOptions = {},
): ReceiptParseResult {
  const limit = options.limit ?? 50;
  const favorites = options.favoriteStores ?? [];
  const lineCtx = buildLineContext(raw, favorites);
  const detectedStore = detectFavoriteStore(raw, favorites);

  const pieces = raw.includes("\n")
    ? raw.split(/\n+/)
    : raw.split(/[,;]+/);

  const seen = new Set<string>();
  const items: string[] = [];

  for (const piece of pieces) {
    if (detectedStore && isReceiptHeaderLine(piece, detectedStore)) continue;
    const name = normalizeReceiptLine(piece, lineCtx);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(name.slice(0, 100));
    if (items.length >= limit) break;
  }

  return { items, detectedStore };
}

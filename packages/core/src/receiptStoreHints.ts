/**
 * Store-aware receipt hints — header detection and chain-specific noise rules.
 *
 * Favorite stores from Settings feed into OCR parsing: we try to spot the
 * receipt header among the user's picks, then apply tighter noise filters for
 * that chain's typical layout.
 */

export interface FavoriteStoreHint {
  id: string;
  name: string;
}

/** OCR tokens that often appear in a chain's receipt header (not exhaustive). */
export const CHAIN_HEADER_ALIASES: Record<string, string[]> = {
  aldi: ["aldi"],
  costco: ["costco", "costco wholesale"],
  "food-lion": ["food lion"],
  "giant-eagle": ["giant eagle"],
  heb: ["h-e-b", "heb", "h e b"],
  "hy-vee": ["hy-vee", "hyvee", "hy vee"],
  kroger: ["kroger"],
  meijer: ["meijer"],
  publix: ["publix"],
  ralphs: ["ralphs"],
  safeway: ["safeway"],
  sprouts: ["sprouts", "sprouts farmers"],
  "stop-shop": ["stop & shop", "stop and shop"],
  target: ["target"],
  "trader-joes": ["trader joe", "trader joe's"],
  walmart: ["walmart", "wal-mart", "wal mart"],
  "whole-foods": ["whole foods", "whole foods market"],
  winndixie: ["winn-dixie", "winn dixie"],
};

/** Extra line-level noise beyond the generic receipt filter, keyed by chain id. */
export const CHAIN_EXTRA_NOISE: Record<string, RegExp[]> = {
  aldi: [/\baldi\b/i, /\bquarterly\b/i],
  costco: [/\bkirkland\b/i, /\bks\b/i, /\bmembership\b/i],
  heb: [/\bheb\b/i, /\bcurbside\b/i, /\bmeal simple\b/i],
  kroger: [/\bplus card\b/i, /\bfuel points\b/i, /\bboost\b/i],
  publix: [/\bpublix\b/i, /\bgreenwise\b/i],
  safeway: [/\bsafeway\b/i, /\bjust for u\b/i],
  target: [/\btarget\b/i, /\bcircle\b/i, /\bredcard\b/i],
  walmart: [/\bwalmart\b/i, /\bgreat value\b/i, /\bgv\b/i, /\bwm\b/i],
  "whole-foods": [/\b365\b/i, /\bwhole foods\b/i],
};

/** Header/footer patterns common once we know this is a store receipt. */
export const RECEIPT_HEADER_NOISE: RegExp[] = [
  /\bstore\s*#?\s*\d+/i,
  /\btrans( action)?\s*#?\s*\d+/i,
  /\blane\s*\d+/i,
  /\bcashier\b/i,
  /\bop\s*\d+/i,
  /\breg\s*\d+/i,
  /\bterminal\b/i,
  /\bphone\b/i,
  /\btel\b/i,
  /\bopen\s+\d/i,
  /\b\d+\s+\w+(\s+\w+)?\s+(st|street|ste|ave|avenue|rd|road|blvd|dr|way|ln|lane)\b/i,
  /\b\d{5}(-\d{4})?\b/,
];

/**
 * Lines in the receipt header block that should not become pantry items.
 * Applies once a favorite store has been detected on the receipt.
 */
export function isReceiptHeaderLine(raw: string, store: FavoriteStoreHint): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return true;

  const lower = trimmed.toLowerCase();
  for (const term of matchTermsForStore(store)) {
    if (lower === term) return true;
    if (lower.includes(term) && trimmed.length <= term.length + 12) return true;
  }

  return RECEIPT_HEADER_NOISE.some((re) => re.test(trimmed));
}

function headerSearchText(raw: string): string {
  return raw
    .split(/\n+/)
    .slice(0, 15)
    .join("\n")
    .toLowerCase();
}

function matchTermsForStore(store: FavoriteStoreHint): string[] {
  if (store.id.startsWith("custom:")) {
    return [store.name.trim().toLowerCase()].filter((t) => t.length >= 3);
  }
  const aliases = CHAIN_HEADER_ALIASES[store.id] ?? [];
  return [store.name.trim().toLowerCase(), ...aliases.map((a) => a.toLowerCase())];
}

/**
 * Pick the best-matching favorite store from OCR text (receipt header region).
 * Longest matching alias wins to prefer "whole foods market" over "whole".
 */
export function detectFavoriteStore(
  raw: string,
  favorites: FavoriteStoreHint[],
): FavoriteStoreHint | null {
  if (favorites.length === 0) return null;

  const header = headerSearchText(raw);
  let best: { store: FavoriteStoreHint; score: number } | null = null;

  for (const store of favorites) {
    for (const term of matchTermsForStore(store)) {
      if (term.length < 3 || !header.includes(term)) continue;
      if (!best || term.length > best.score) {
        best = { store, score: term.length };
      }
    }
  }

  return best?.store ?? null;
}

/** Noise patterns to apply once a store (or generic receipt) is identified. */
export function noisePatternsForStore(storeId: string | null): RegExp[] {
  const patterns = [...RECEIPT_HEADER_NOISE];
  if (!storeId || storeId.startsWith("custom:")) return patterns;
  const chainNoise = CHAIN_EXTRA_NOISE[storeId];
  if (chainNoise) patterns.push(...chainNoise);
  return patterns;
}

/**
 * brandPalette — the flat "loaf mark" illustration system, in color.
 *
 * The brand identity is two constants + a rotating ground: every icon is a
 * CREAM silhouette with a single GREEN leaf accent, set on one of a curated,
 * muted, warm EARTHY ground color. Because the grounds share one register, the
 * set reads as a family even across reds, golds, greens, teals, and plum.
 *
 * These are brand constants (NOT theme tokens) — the same in light and dark,
 * exactly like the app icon. Section colors can echo meaning (Collections =
 * plum, Cookbook = spruce). Hexes are matched to the loaf mark; swap for the
 * locked brand values when they land.
 */

export const BRAND_GROUNDS = {
  terracotta: '#C16A3B',
  brick: '#B54B3B',
  ochre: '#BF8B2E',
  cocoa: '#855637',
  olive: '#77814B',
  fern: '#4E7A45',
  spruce: '#3F736C',
  blue: '#4C6B84',
  plum: '#7C5568',
} as const;

export type BrandTone = keyof typeof BRAND_GROUNDS;

/** The two constants that make the family "the brand" in any color. */
export const BRAND_CREAM = '#F2EDE1';
export const BRAND_LEAF = '#2C5C39';

/** Resolve a tone key to its hex (falls back to terracotta). */
export function toneHex(tone: BrandTone): string {
  return BRAND_GROUNDS[tone] ?? BRAND_GROUNDS.terracotta;
}

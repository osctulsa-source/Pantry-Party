/**
 * Themeable token layer (ADR-006).
 *
 * The brand is decoupled from the codebase. Every brand-specific value lives HERE.
 * Change this one file and the whole app re-skins — feature code never hardcodes a
 * hex value or font name; it imports `tokens`.
 *
 *   import { tokens } from "@/theme/tokens";
 *   <View style={{ backgroundColor: tokens.color.surface }} />
 *
 * ACTIVE VISUAL DIRECTION: "Crumb" — warm organic (locked Jun 2026).
 * Oat canvas · forest-green primary · terracotta secondary. Chosen via a color-theory
 * study: green signals fresh / natural / sustainable + trust; a warm secondary adds
 * appetite warmth and differentiates from the sea-of-green competitors; a warm-neutral
 * surface flatters food photography. All values below are verified WCAG-AA on the oat
 * surface, and the expiry palette is engineered colorblind-safe (see `semantic.expiry`).
 *
 * NOTE: "Crumb" is the internal VISUAL-direction label, NOT the product name. The product
 * name stays decoupled (codename "Breadbox" via brand.ts) until trademark clearance lands.
 * Signature typefaces (Bitter + Nunito Sans) are a follow-up PR — this set keeps the repo's
 * current Source Serif 4 + Inter until those fonts are installed (lockfile regen required).
 */

import { BRAND } from './brand';

export type ColorScheme = 'light' | 'dark';

export interface ThemeTokens {
  brandName: string; // display name; codename until the real one lands
  /** light/dark hint — drives StatusBar style and any scheme-aware UI. */
  colorScheme: ColorScheme;
  color: {
    accent: string; // primary brand — buttons, links, brand marks
    onAccent: string; // text/icons placed ON accent fills (e.g. button labels)
    accentSoft: string; // tinted accent background — badges, selected states
    secondary: string; // warm secondary (terracotta). LARGE/accent use only — pair with ink for text
    ink: string; // primary text
    inkMuted: string; // secondary text
    surface: string; // app canvas
    surfaceAlt: string; // cards, wells, input fills
    line: string; // hairlines, dividers, borders
    success: string;
    warning: string;
  };
  /**
   * Semantic tokens — meaning, not raw palette. Feature code reads these when the color
   * carries product meaning (expiry urgency). Engineered colorblind-safe: each state pairs
   * with a distinct icon + text in the UI, and the colors form a light→dark luminance ramp
   * so urgency survives grayscale and red-green color-vision deficiency. (A naive hue-only
   * green/amber/red triad collapses to ~1:1 contrast under deuteranopia.)
   */
  semantic: {
    expiry: {
      fresh: string; // neutral — calm, recedes (color = urgency only)
      warning: string; // ochre — 0–3 days to expiry
      expired: string; // brick — past date
    };
  };
  font: {
    /**
     * Variant-specific family names (@expo-google-fonts): each weight is its own registered
     * family, NOT a fontWeight on a base family. Don't combine these with `fontWeight`.
     */
    display: { regular: string; semibold: string; bold: string };
    body: { regular: string; medium: string; semibold: string };
    mono: string;
  };
  radius: { sm: number; md: number; lg: number };
  space: (n: number) => number; // 4pt grid: space(2) = 8
}

// `fresh` mirrors `inkMuted` (neutral) without duplicating the hex.
const INK_MUTED = '#6E6856';

/**
 * Crumb — warm organic. The active theme.
 * Computed contrast vs surface #F6F2E9 (WCAG 2.x relative luminance):
 *   ink 14.4:1 · inkMuted 4.98:1 · accent 6.85:1 (oat-on-accent 6.85:1) ·
 *   secondary 3.35:1 (AA-large only) · expiry.warning 5.47:1 · expiry.expired 6.01:1.
 */
export const crumbTokens: ThemeTokens = {
  brandName: BRAND.productName,
  colorScheme: 'light',
  color: {
    accent: '#2E5D3A',
    onAccent: '#F6F2E9',
    accentSoft: '#DDE7D6',
    secondary: '#C76B43',
    ink: '#23211B',
    inkMuted: INK_MUTED,
    surface: '#F6F2E9',
    surfaceAlt: '#ECE5D4',
    line: '#E3DBC8',
    success: '#3F7A50',
    warning: '#875811',
  },
  semantic: {
    expiry: {
      fresh: INK_MUTED, // neutral; mirrors inkMuted (4.98:1) — non-urgent items stay calm
      warning: '#875811', // ochre; AA on oat (5.47:1); 0–3 days
      expired: '#9E3B33', // brick; AA on oat (6.01:1); past date — "deal with this", not "system error"
    },
  },
  font: {
    display: {
      regular: 'SourceSerif4_400Regular',
      semibold: 'SourceSerif4_600SemiBold',
      bold: 'SourceSerif4_700Bold',
    },
    body: {
      regular: 'Inter_400Regular',
      medium: 'Inter_500Medium',
      semibold: 'Inter_600SemiBold',
    },
    mono: 'Menlo',
  },
  radius: { sm: 10, md: 16, lg: 24 }, // soft / rounded — Crumb's warm-organic shape
  space: (n: number) => n * 4,
};

/**
 * The active export. Brand swap or light/dark later: define another ThemeTokens set and
 * make `tokens` a function of a ThemeName selected at a provider. For now there is one
 * locked direction, so this stays a single object — re-skinning is editing this file (ADR-006).
 */
export const tokens: ThemeTokens = crumbTokens;

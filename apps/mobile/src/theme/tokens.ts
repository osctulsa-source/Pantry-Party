/**
 * Themeable token layer (ADR-006).
 *
 * The brand (Larder / Crumb / TBD) is decoupled from the codebase. Every brand-specific
 * value lives HERE. When the name + theme lock, you change this one file and the whole app
 * re-skins — no feature code touches color or type literals directly.
 *
 * RULE: feature code imports `tokens`, never hardcodes a hex value or font name.
 *
 *   import { tokens } from "@/theme/tokens";
 *   <View style={{ backgroundColor: tokens.color.surface }} />
 */

export interface ThemeTokens {
  brandName: string; // display name; codename until the real one lands
  color: {
    accent: string;
    ink: string;
    inkMuted: string;
    surface: string;
    surfaceAlt: string;
    success: string;
    warning: string;
  };
  font: {
    display: { regular: string; semibold: string; bold: string };
    body: { regular: string; medium: string; semibold: string };
    mono: string;
  };
  radius: { sm: number; md: number; lg: number };
  space: (n: number) => number; // 4pt grid: space(2) = 8
}

/** Codename palette — deliberately neutral placeholder. Swap wholesale at brand lock. */
export const tokens: ThemeTokens = {
  brandName: "Breadbox", // ← replace with the final brand here, once
  color: {
    accent: "#8B1D1D",
    ink: "#1A1A1A",
    inkMuted: "#555555",
    surface: "#FDFCF8",
    surfaceAlt: "#F5ECD3",
    success: "#2D5A3D",
    warning: "#A06520",
  },
  font: {
    /**
     * Variant-specific font family names. RN best practice with @expo-google-fonts:
     * each weight is its own registered family, NOT a fontWeight on a base family.
     * Don't combine these with `fontWeight` in styles — pick the right variant.
     */
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
    mono: 'Menlo', // iOS system mono; Android falls back to its system mono. No custom mono loaded yet.
  },
  radius: { sm: 6, md: 10, lg: 16 },
  space: (n: number) => n * 4,
};

/**
 * When the brand is chosen, define its token set and swap the export. Example:
 *
 *   export const larderTokens: ThemeTokens = { brandName: "Larder", color: { accent: "#8B1D1D", ... }, ... };
 *   export const tokens = larderTokens;
 *
 * Multi-brand or light/dark later: make `tokens` a function of a ThemeName and select at
 * the provider. The point is that this file is the ONLY thing that changes.
 */

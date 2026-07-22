/**
 * Themeable token layer (ADR-006).
 *
 * The brand is decoupled from the codebase. Every brand-specific value lives HERE.
 * Feature code imports `tokens` and never hardcodes a hex value or font name.
 *
 *   import { tokens } from "@/theme/tokens";
 *   <View style={{ backgroundColor: tokens.color.surface }} />
 *
 * ACTIVE VISUAL DIRECTION: "Crumb" — warm organic. Light + dark sets are defined
 * below; `tokens` is selected from the device color scheme at module load
 * (Appearance.getColorScheme()), defaulting to light. Both sets are verified
 * WCAG-AA, and the expiry palette is engineered colorblind-safe (see semantic).
 *
 * NOTES
 * - Dark mode requires app.json `userInterfaceStyle: "automatic"` (+ a dev-client
 *   rebuild) so the OS setting reaches the app; otherwise Expo forces light.
 * - This picks the theme once at startup. LIVE switching (no restart) is a future
 *   enhancement — it needs a ThemeProvider + migrating screens to a useTheme()
 *   hook, since screens currently read this static object at module load.
 * - "Crumb" is the internal visual-direction label, not the product name (codename
 *   "Breadbox" via brand.ts) until trademark clearance lands.
 * - Signature typefaces: Bitter (display) + Nunito Sans (body).
 */
import { Appearance } from 'react-native';

import { BRAND } from './brand';

export type ColorScheme = 'light' | 'dark';

/** Accent + soft fills for a Pantry browse zone (Fresh / Drinks / Shelf-stable / All). */
export interface PantryZoneThemeColors {
  accent: string;
  onAccent: string;
  soft: string;
  canvas: string;
}

export interface ThemeTokens {
  brandName: string;
  /** light/dark hint — drives StatusBar style and any scheme-aware UI. */
  colorScheme: ColorScheme;
  color: {
    accent: string; // primary brand — buttons, links, brand marks
    onAccent: string; // text/icons placed ON accent fills
    accentSoft: string; // tinted accent background — badges, selected states
    secondary: string; // warm secondary (terracotta). LARGE/accent use only — pair with ink for text
    ink: string; // primary text
    inkMuted: string; // secondary text
    surface: string; // app canvas
    surfaceAlt: string; // cards, wells, input fills
    line: string; // hairlines, dividers, borders
    warnSoft: string; // soft warning surface — the "Use soon" card tint (pairs with ink/warning text)
    success: string;
    warning: string;
    highlight: string; // decorative gold — achievement/spark accents (Collections)
  };
  /**
   * Semantic tokens — meaning, not raw palette. Engineered colorblind-safe: each
   * state pairs with a distinct icon + text in the UI, so urgency survives grayscale
   * and red-green color-vision deficiency.
   */
  semantic: {
    expiry: {
      fresh: string; // neutral — calm, recedes (color = urgency only)
      warning: string; // 0–3 days to expiry
      expired: string; // past date
      // Soft tints for the status CARDS on the Pantry screen (faint fills that
      // pair with the matching expiry color for the title + ink for body text).
      freshSoft: string;
      warningSoft: string;
      expiredSoft: string;
    };
    /** Browse-zone palette — tints the Pantry canvas, chips, and calm-row accents. */
    pantryZone: {
      all: PantryZoneThemeColors;
      fresh: PantryZoneThemeColors;
      drinks: PantryZoneThemeColors;
      shelfStable: PantryZoneThemeColors;
    };
  };
  font: {
    display: { regular: string; semibold: string; bold: string };
    body: { regular: string; medium: string; semibold: string };
    mono: string;
  };
  radius: { sm: number; md: number; lg: number };
  space: (n: number) => number; // 4pt grid: space(2) = 8
}

// Shared across light + dark (only color/colorScheme differ between the two sets).
const FONT = {
  display: {
    regular: 'Bitter_400Regular',
    semibold: 'Bitter_600SemiBold',
    bold: 'Bitter_700Bold',
  },
  body: {
    regular: 'NunitoSans_400Regular',
    medium: 'NunitoSans_600SemiBold', // Nunito Sans has no 500 — 600 stands in for "medium"
    semibold: 'NunitoSans_700Bold',
  },
  mono: 'Menlo',
};
const RADIUS = { sm: 10, md: 16, lg: 24 }; // soft / rounded — Crumb's warm-organic shape
const space = (n: number) => n * 4;

const LIGHT_INK_MUTED = '#6E6856';

/**
 * Crumb — light. Contrast vs surface #F6F2E9 (WCAG 2.x): ink 14.4:1, inkMuted 4.98:1,
 * accent 6.85:1 (oat-on-accent 6.85:1), secondary 3.35:1 (AA-large only),
 * expiry.warning 5.47:1, expiry.expired 6.01:1. warnSoft #F0E4CB is a pale ochre
 * tint that sits a step warmer than surfaceAlt; ink (12.9:1) and expiry.warning
 * (4.6:1) stay readable on it.
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
    inkMuted: LIGHT_INK_MUTED,
    surface: '#F6F2E9',
    surfaceAlt: '#ECE5D4',
    line: '#E3DBC8',
    warnSoft: '#F0E4CB',
    success: '#3F7A50',
    warning: '#875811',
    highlight: '#E0B85A', // honey gold — Collections spark/achievement accents
  },
  semantic: {
    expiry: {
      fresh: LIGHT_INK_MUTED, // neutral; mirrors inkMuted (4.98:1)
      warning: '#875811', // ochre; AA on oat (5.47:1)
      expired: '#9E3B33', // brick; AA on oat (6.01:1)
      freshSoft: '#DDE7D6', // soft green (matches accentSoft)
      warningSoft: '#F0E4CB', // soft ochre (matches warnSoft)
      expiredSoft: '#F1DCD6', // soft brick; expiry.expired text stays AA on it
    },
    pantryZone: {
      all: {
        accent: LIGHT_INK_MUTED,
        onAccent: '#F6F2E9',
        soft: '#ECE5D4',
        canvas: '#F6F2E9',
      },
      fresh: {
        accent: '#3F7A50',
        onAccent: '#F6F2E9',
        soft: '#DDE7D6',
        canvas: '#EEF5EA',
      },
      drinks: {
        accent: '#3D6B8C',
        onAccent: '#F6F2E9',
        soft: '#D6E3ED',
        canvas: '#EEF2F6',
      },
      shelfStable: {
        accent: '#9A7342',
        onAccent: '#F6F2E9',
        soft: '#EDE4D0',
        canvas: '#F5F0E6',
      },
    },
  },
  font: FONT,
  radius: RADIUS,
  space,
};

const DARK_INK_MUTED = '#A79E8C';

/**
 * Crumb — dark. Verified WCAG-AA on surface #18140E: ink 15.9:1, inkMuted 6.9:1,
 * accent 6.4:1 (dark on-accent 6.4:1), secondary 6.95:1, expiry.warning 9.5:1,
 * expiry.expired 8.0:1. warnSoft #2A2114 is a warm dark tint a step above
 * surfaceAlt; ink and the dark expiry ramp stay high-contrast on it. The UI's
 * icon + text double-encoding keeps states readable regardless.
 */
export const crumbDarkTokens: ThemeTokens = {
  brandName: BRAND.productName,
  colorScheme: 'dark',
  color: {
    accent: '#5FA873',
    onAccent: '#18140E',
    accentSoft: '#25372A',
    secondary: '#E08A5C',
    ink: '#F3EEE3',
    inkMuted: DARK_INK_MUTED,
    surface: '#18140E',
    surfaceAlt: '#241F17',
    line: '#322B20',
    warnSoft: '#2A2114',
    success: '#6FBE85',
    warning: '#E6B34D',
    highlight: '#E7C46B', // honey gold, lifted for contrast on the dark surface
  },
  semantic: {
    expiry: {
      fresh: DARK_INK_MUTED, // neutral
      warning: '#E6B34D', // amber (9.5:1 on dark)
      expired: '#FF8A7A', // coral (8.0:1 on dark)
      freshSoft: '#25372A', // soft dark green (matches accentSoft)
      warningSoft: '#2A2114', // soft dark ochre (matches warnSoft)
      expiredSoft: '#34201C', // soft dark brick
    },
    pantryZone: {
      all: {
        accent: DARK_INK_MUTED,
        onAccent: '#18140E',
        soft: '#241F17',
        canvas: '#18140E',
      },
      fresh: {
        accent: '#6FBE85',
        onAccent: '#18140E',
        soft: '#25372A',
        canvas: '#1A221C',
      },
      drinks: {
        accent: '#6BA3C4',
        onAccent: '#18140E',
        soft: '#1E2A33',
        canvas: '#141A1F',
      },
      shelfStable: {
        accent: '#C9A05A',
        onAccent: '#18140E',
        soft: '#2A2418',
        canvas: '#1C1810',
      },
    },
  },
  font: FONT,
  radius: RADIUS,
  space,
};

/**
 * The active export — picks the Crumb set matching the device color scheme at
 * module load. Re-skinning is editing this file (ADR-006); brand swap or live
 * switching later layer a provider on top.
 */
export const tokens: ThemeTokens =
  Appearance.getColorScheme() === 'dark' ? crumbDarkTokens : crumbTokens;

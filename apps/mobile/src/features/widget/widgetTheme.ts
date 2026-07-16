/**
 * Widget theme bridge (ADR-006 compliant theming for home-screen widgets).
 *
 * A `'widget'`-directive component runs in an isolated runtime inside the
 * widget extension: it cannot import theme/tokens (or anything else at module
 * scope). So instead of hardcoding hex values in the widget layouts — which
 * the theming rule forbids — the app serializes the token palette into the
 * widget's props on every snapshot push. The widget then picks the light or
 * dark set at render time from `environment.colorScheme`.
 *
 * Only the handful of colors widgets actually use are shipped, to keep the
 * snapshot payload small.
 */
import { crumbDarkTokens, crumbTokens, type ThemeTokens } from '../../theme/tokens';

/** The color subset a widget layout needs, derived from one token set. */
export interface WidgetPalette {
  accent: string;
  ink: string;
  inkMuted: string;
  surface: string;
  surfaceAlt: string;
  warning: string;
  expired: string;
}

/** Light + dark palettes; the widget selects per render from the environment. */
export interface WidgetThemePair {
  light: WidgetPalette;
  dark: WidgetPalette;
}

function toPalette(t: ThemeTokens): WidgetPalette {
  return {
    accent: t.color.accent,
    ink: t.color.ink,
    inkMuted: t.color.inkMuted,
    surface: t.color.surface,
    surfaceAlt: t.color.surfaceAlt,
    warning: t.semantic.expiry.warning,
    expired: t.semantic.expiry.expired,
  };
}

/** Both palettes, straight from the token layer — the brand swaps with tokens.ts. */
export function buildWidgetThemePair(): WidgetThemePair {
  return {
    light: toPalette(crumbTokens),
    dark: toPalette(crumbDarkTokens),
  };
}

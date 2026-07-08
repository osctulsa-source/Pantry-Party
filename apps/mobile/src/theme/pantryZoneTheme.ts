/**
 * Pantry browse-zone theming — maps a zone filter to token colors (ADR-006).
 */
import type { PantryZone } from '@breadbox/core';

import { tokens, type PantryZoneThemeColors } from './tokens';

export type PantryZoneFilter = PantryZone | 'all';

export function pantryZoneTheme(zone: PantryZoneFilter): PantryZoneThemeColors {
  return tokens.semantic.pantryZone[zone];
}

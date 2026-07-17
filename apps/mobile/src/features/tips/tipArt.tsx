/**
 * tipArt — tip category → lucide icon + brand tone, one entry per category
 * (Record type keeps it complete as categories grow). Lives beside the Tips
 * screen but separate so art changes never touch tip data (the stapleArt
 * pattern). Icons render 16px inside a soft-toned chip on tip cards.
 */
import type { ComponentType } from 'react';
import {
  Apple,
  Archive,
  Carrot,
  ChefHat,
  CookingPot,
  Croissant,
  Lightbulb,
  ShieldCheck,
  Snowflake,
} from 'lucide-react-native';

import type { TipCategory } from '@breadbox/core';
import { toneHex, type BrandTone } from '../../theme/brandPalette';

interface TipArt {
  Icon: ComponentType<{ size?: number; color?: string }>;
  tone: BrandTone;
}

export const TIP_ART: Record<TipCategory, TipArt> = {
  cookware: { Icon: CookingPot, tone: 'spruce' },
  ingredients: { Icon: Carrot, tone: 'terracotta' },
  technique: { Icon: ChefHat, tone: 'cocoa' },
  baking: { Icon: Croissant, tone: 'ochre' },
  produce: { Icon: Apple, tone: 'fern' },
  storage: { Icon: Archive, tone: 'blue' },
  freezer: { Icon: Snowflake, tone: 'blue' },
  safety: { Icon: ShieldCheck, tone: 'brick' },
  general: { Icon: Lightbulb, tone: 'plum' },
};

/** Soft chip background for a category (tone at low alpha over the surface). */
export function tipToneSoft(cat: TipCategory): string {
  return toneHex(TIP_ART[cat].tone) + '22';
}

export function tipTone(cat: TipCategory): string {
  return toneHex(TIP_ART[cat].tone);
}

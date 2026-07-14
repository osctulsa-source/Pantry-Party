/**
 * deviceArt — cooking-device id → loaf-mark glyph for the Cook tab's device
 * tiles. Glyph names equal device ids today (the map is identity), but the
 * indirection matches stapleArt/dietArt and keeps the UI insulated. The four
 * ids beyond main's COOKING_DEVICES (instantpot/sheetpan/microwave/nocook)
 * are mapped ahead for the in-flight lazy-kitchen device expansion.
 */
import type { BrandFoodName } from '../../components/BrandIcon';

export const DEVICE_ART: Record<string, BrandFoodName> = {
  stove: 'stove',
  oven: 'oven',
  crockpot: 'crockpot',
  airfryer: 'airfryer',
  grill: 'grill',
  griddle: 'griddle',
  // Mapped ahead (ship with the in-flight lazy-kitchen work)
  instantpot: 'instantpot',
  sheetpan: 'sheetpan',
  microwave: 'microwave',
  nocook: 'nocook',
};

export function deviceGlyph(id: string): BrandFoodName {
  const glyph = DEVICE_ART[id];
  if (glyph === undefined && __DEV__) {
    console.warn(`deviceArt: no glyph for "${id}" — falling back to spoon`);
  }
  return glyph ?? 'spoon';
}

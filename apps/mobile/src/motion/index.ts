/**
 * Brand motion kit — reusable Reanimated celebrations & loaders.
 * Every export honors `useReduceMotion` (static end-state, no loops).
 */
export { MOTION, EASE, MOTION_FERN } from './timing';
export {
  FlameGlyph,
  FridgeGlyph,
  ReceiptGlyph,
  HeartGlyph,
  SparkleGlyph,
  SproutGlyph,
  BreadGlyph,
  motionPaint,
} from './glyphs';

export { WelcomeSplash } from './WelcomeSplash';
export { FirstRunReveal } from './FirstRunReveal';
export { SimmeringLoader } from './SimmeringLoader';
export { ReceiptScanLoader } from './ReceiptScanLoader';
export { CookedItCelebration } from './CookedItCelebration';
export { EmptyPantryMotion } from './EmptyPantryMotion';
export { SyncBeacon, type SyncBeaconState } from './SyncBeacon';
export { BarcodeScanSuccess } from './BarcodeScanSuccess';
export { ExpiringSoonAlert } from './ExpiringSoonAlert';
export { UsedUpMotion } from './UsedUpMotion';
export { RecipeSavedHeart } from './RecipeSavedHeart';
export { GroceryCheckOff } from './GroceryCheckOff';
export { StreakMilestone } from './StreakMilestone';
export { SproutRefresh } from './SproutRefresh';

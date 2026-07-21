/**
 * BadgeGrid — the achievement badge grid from the App Elements design kit (1i).
 * Earned tiles take the badge's brand ground (a constant, like the icon family);
 * locked tiles fall back to a neutral themed surface at reduced opacity.
 *
 * The animated companion (1j) lives in ProgressRingBadge — kept separate so this
 * static grid stays free of reanimated.
 */
import { StyleSheet, View } from 'react-native';

import { toneHex, type BrandTone } from '../../theme/brandPalette';
import { tokens } from '../../theme/tokens';
import { BrandIcon, FOOD_TONE, type BrandFoodName } from '../BrandIcon';

export interface Badge {
  food: BrandFoodName;
  /** Ground when earned; defaults to the food's natural tone. */
  tone?: BrandTone;
  earned: boolean;
  /** Short name for assistive tech (e.g. "7-day streak"). */
  label?: string;
}

export function BadgeGrid({ badges }: { badges: Badge[] }) {
  return (
    <View style={styles.grid}>
      {badges.map((b, i) => (
        <View
          key={i}
          style={[
            styles.tile,
            b.earned
              ? { backgroundColor: toneHex(b.tone ?? FOOD_TONE[b.food]) }
              : styles.tileLocked,
          ]}
          accessibilityRole="image"
          accessibilityLabel={b.label ? `${b.label}${b.earned ? ', earned' : ', locked'}` : undefined}
        >
          <View style={b.earned ? undefined : styles.lockedGlyph}>
            <BrandIcon name={b.food} tone={b.tone} variant={b.earned ? 'onColor' : 'onLight'} size={26} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(3) },
  tile: {
    width: 68,
    height: 68,
    borderRadius: tokens.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLocked: { backgroundColor: tokens.color.surfaceAlt },
  lockedGlyph: { opacity: 0.45 },
});

/**
 * BrandTile — one tappable illustrated tile (Direction B): solid earthy ground
 * panel, cream loaf-mark glyph, label below. Selected = ink outline + ✓ dot.
 * Stateless like QuickAddStaples; the parent owns selection.
 *
 * `cornerAccessory` (optional) renders in the panel's top-left with its own
 * touch handling — Quick Add uses it for the refine chevron. The glyph is
 * decorative; the label (via accessibilityLabel) carries meaning.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '../theme/tokens';
import { BRAND_CREAM, toneHex, type BrandTone } from '../theme/brandPalette';
import { BrandIcon, FOOD_TONE, type BrandFoodName } from './BrandIcon';

export function BrandTile({
  glyph,
  tone,
  label,
  selected = false,
  disabled = false,
  onPress,
  cornerAccessory,
}: {
  glyph: BrandFoodName;
  /** Ground override; defaults to the glyph's natural tone. */
  tone?: BrandTone;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  /** Extra corner control (refine chevron). Handles its own presses. */
  cornerAccessory?: React.ReactNode;
}) {
  const ground = toneHex(tone ?? FOOD_TONE[glyph]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={selected ? `${label}, added` : label}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={[styles.panel, { backgroundColor: ground }]}>
        <BrandIcon name={glyph} tone={tone} variant="onColor" size={34} />
        {selected && (
          <View style={styles.checkDot}>
            <Text style={styles.checkTxt}>✓</Text>
          </View>
        )}
        {cornerAccessory !== undefined && <View style={styles.corner}>{cornerAccessory}</View>}
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: 4,
    alignItems: 'stretch',
  },
  cardSelected: { borderColor: tokens.color.ink },
  panel: {
    borderRadius: 10,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: tokens.color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkTxt: { color: BRAND_CREAM, fontSize: 9, fontFamily: tokens.font.body.semibold },
  corner: { position: 'absolute', top: 2, left: 2 },
  label: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    lineHeight: 16,
    color: tokens.color.ink,
    textAlign: 'center',
    paddingVertical: 3,
  },
});

/**
 * Settings iconography from the App Elements design kit — 1k and 1l — on the
 * app's real BrandIcon glyphs. Two presentations of the same data shape:
 *
 *  - SettingsList (1k): left-aligned glyph + label rows.
 *  - SettingsTiles (1l): a grid of glyph tiles (icon-grid nav).
 *
 * Both are theme-aware (tokens) and expose proper button semantics — the glyph
 * is decorative, so the label carries the accessible name (tiles pass it via
 * accessibilityLabel since they show no visible text).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../theme/tokens';
import { BrandIcon, type BrandFoodName } from '../BrandIcon';

export interface SettingsItem {
  food: BrandFoodName;
  label: string;
  onPress: () => void;
}

export function SettingsList({ items }: { items: SettingsItem[] }) {
  return (
    <View style={styles.list}>
      {items.map((it, i) => (
        <Pressable
          key={i}
          onPress={it.onPress}
          accessibilityRole="button"
          accessibilityLabel={it.label}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <BrandIcon name={it.food} variant="onLight" size={22} />
          </View>
          <Text style={styles.label}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SettingsTiles({ items }: { items: SettingsItem[] }) {
  return (
    <View style={styles.grid}>
      {items.map((it, i) => (
        <Pressable
          key={i}
          onPress={it.onPress}
          accessibilityRole="button"
          accessibilityLabel={it.label}
          style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
        >
          <BrandIcon name={it.food} variant="onLight" size={22} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: tokens.space(1) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
  },
  label: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(3) },
  tile: {
    width: 68,
    height: 68,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});

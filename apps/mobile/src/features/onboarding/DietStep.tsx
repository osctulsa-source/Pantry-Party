/**
 * DietStep — onboarding step 1: "Do you follow any diets? Any allergies?"
 * BrandTile grids over DIET_OPTIONS + ALLERGY_OPTIONS. Controlled + stateless:
 * the parent owns the selections (and persists them into the TasteProfile on
 * continue). Tiles stay tappable when selected — diet choices are reversible,
 * unlike staple adds. Continue with nothing selected IS the skip path.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ALLERGY_OPTIONS, DIET_OPTIONS, type TasteOption } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { BrandTile } from '../../components/BrandTile';
import { ALLERGY_ART, DIET_ART } from './dietArt';
import type { BrandFoodName } from '../../components/BrandIcon';

export interface DietSelection {
  diets: string[];
  allergies: string[];
}

function toggle(list: string[], slug: string): string[] {
  return list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
}

function TileGrid({
  options,
  art,
  selected,
  onToggle,
}: {
  options: TasteOption[];
  art: Record<string, BrandFoodName>;
  selected: string[];
  onToggle: (slug: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {options.map((o) => (
        <View key={o.slug} style={styles.cell}>
          <BrandTile
            glyph={art[o.slug] as BrandFoodName}
            label={o.label}
            selected={selected.includes(o.slug)}
            onPress={() => onToggle(o.slug)}
          />
        </View>
      ))}
    </View>
  );
}

export function DietStep({
  diets,
  allergies,
  onChange,
  onContinue,
}: {
  diets: string[];
  allergies: string[];
  onChange: (sel: DietSelection) => void;
  onContinue: () => void;
}) {
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>1 of 2</Text>
        <Text style={styles.title}>Do you follow any diets?</Text>
        <Text style={styles.hint}>
          We'll hide recipes that don't fit. You can change this anytime in Your Kitchen.
        </Text>
        <TileGrid
          options={DIET_OPTIONS}
          art={DIET_ART}
          selected={diets}
          onToggle={(slug) => onChange({ diets: toggle(diets, slug), allergies })}
        />
        <Text style={styles.section}>Any allergies?</Text>
        <TileGrid
          options={ALLERGY_OPTIONS}
          art={ALLERGY_ART}
          selected={allergies}
          onToggle={(slug) => onChange({ diets, allergies: toggle(allergies, slug) })}
        />
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={styles.cta} onPress={onContinue} accessibilityRole="button">
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: tokens.space(6) },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.accent,
    marginBottom: tokens.space(2),
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 28,
    color: tokens.color.ink,
    letterSpacing: -0.5,
    marginBottom: tokens.space(2),
  },
  hint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    lineHeight: 20,
    marginBottom: tokens.space(5),
  },
  section: {
    fontFamily: tokens.font.display.bold,
    fontSize: 20,
    color: tokens.color.ink,
    marginTop: tokens.space(6),
    marginBottom: tokens.space(3),
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  // 4 per row; grow capped by maxWidth so ragged last rows stay near full-row width
  cell: { flexBasis: '23%', flexGrow: 1, maxWidth: '25%' },
  footer: { padding: tokens.space(6), paddingTop: tokens.space(3) },
  cta: {
    backgroundColor: tokens.color.accent,
    borderRadius: 999,
    paddingVertical: tokens.space(4),
    alignItems: 'center',
  },
  ctaText: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
});

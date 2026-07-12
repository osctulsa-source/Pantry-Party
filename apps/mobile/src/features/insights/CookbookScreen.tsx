/**
 * CookbookScreen — the recipe side of collections. Cooking a dish collects it;
 * this mirrors that as a Cookbook tally, a Cuisine Passport (one slot per
 * cuisine, filled once you've cooked any dish from it), and meal-type coverage.
 *
 * Honest by construction — it rewards actually cooking (the on-device cook log),
 * never opening or grinding. Data via useRecipeCollections (@breadbox/core).
 * Crumb-styled to sit beside CollectionsScreen; dark-mode safe.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RecipeAxis } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useRecipeCollections } from './useRecipeCollections';
import { BrandLoader, BrandOrnament } from '../../components/BrandDecor';

export function CookbookScreen() {
  const { activeHouseholdId } = useActiveHousehold();
  const { recipes, loading } = useRecipeCollections(activeHouseholdId);

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <BrandLoader variant="carousel-dots" />
        </View>
      </SafeAreaView>
    );
  }

  const { cookbook, cuisines, meals } = recipes;

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.ornament}>
          <BrandOrnament foods={['bread', 'cheese', 'egg', 'fish', 'pepper', 'croissant']} size={26} opacity={0.5} />
        </View>
        {/* Hero: recipes cooked */}
        <View style={styles.heroCard}>
          <Text style={styles.heroNumber}>
            {cookbook.collected}
            <Text style={styles.heroTotal}> / {cookbook.total}</Text>
          </Text>
          <Text style={styles.heroLabel}>recipes cooked</Text>
          <Text style={styles.heroSub}>
            {cookbook.complete ? 'You cooked the whole book 🏆' : 'Your cookbook grows every time you cook'}
          </Text>
        </View>

        <Passport
          title="Cuisine passport"
          blurb="Cook a dish from a place to stamp it."
          axis={cuisines}
          emptyHint="Cook your first dish to start your passport."
        />

        <Passport
          title="Every meal of the day"
          blurb="Breakfast to dessert — collect them all."
          axis={meals}
          emptyHint="No meals cooked yet."
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Passport({
  title,
  blurb,
  axis,
  emptyHint,
}: {
  title: string;
  blurb: string;
  axis: RecipeAxis;
  emptyHint: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>
          {axis.collected}/{axis.total}
        </Text>
      </View>
      <Text style={styles.sectionBlurb}>{blurb}</Text>
      {axis.slots.length === 0 ? (
        <Text style={styles.emptyHint}>{emptyHint}</Text>
      ) : (
        <View style={styles.stamps}>
          {axis.slots.map((s) => (
            <View key={s.key} style={[styles.stamp, s.collected ? styles.stampOn : styles.stampOff]}>
              <Text style={[styles.stampText, s.collected ? styles.stampTextOn : styles.stampTextOff]}>
                {s.collected ? '✓ ' : ''}
                {s.label}
                {s.collected && s.count > 1 ? ` ·${s.count}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ornament: { marginBottom: tokens.space(4) },
  scroll: {
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(10),
  },

  heroCard: {
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.lg,
    padding: tokens.space(6),
    alignItems: 'center',
    marginBottom: tokens.space(5),
  },
  heroNumber: {
    fontFamily: tokens.font.display.bold,
    fontSize: 56,
    color: tokens.color.onAccent,
    letterSpacing: -2,
    lineHeight: 60,
  },
  heroTotal: { fontFamily: tokens.font.display.semibold, fontSize: 30, color: tokens.color.onAccent, opacity: 0.6 },
  heroLabel: { fontFamily: tokens.font.body.medium, fontSize: 15, color: tokens.color.onAccent, opacity: 0.85, marginTop: tokens.space(1) },
  heroSub: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.onAccent, opacity: 0.65, marginTop: tokens.space(2), textAlign: 'center' },

  section: { marginBottom: tokens.space(6) },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: tokens.font.display.semibold, fontSize: 17, color: tokens.color.ink },
  sectionCount: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.inkMuted },
  sectionBlurb: { fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.inkMuted, marginTop: 2, marginBottom: tokens.space(3) },
  emptyHint: { fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.inkMuted, fontStyle: 'italic' },

  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  stamp: { paddingHorizontal: tokens.space(3), paddingVertical: tokens.space(2), borderRadius: 999 },
  stampOn: { backgroundColor: tokens.color.accentSoft },
  stampOff: { backgroundColor: tokens.color.surfaceAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.color.line },
  stampText: { fontFamily: tokens.font.body.medium, fontSize: 13 },
  stampTextOn: { color: tokens.color.accent },
  stampTextOff: { color: tokens.color.inkMuted },
});

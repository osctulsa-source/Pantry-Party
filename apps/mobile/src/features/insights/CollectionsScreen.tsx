/**
 * CollectionsScreen — "Your collection": the variety Pokédex.
 *
 * Pushed from SettingsScreen (root-stack route, over the tab bar). Every staple
 * in the foodKinds taxonomy is a collectible SET; logging a specific variety
 * ("Cheddar cheese", "Fuji apples") fills a slot. This screen mirrors that
 * progress — a header tally, a "so close" nudge for the set nearest completion,
 * a card per set with its own hand-drawn glyph (full color when you've started
 * it, a ghost outline when not) + filled/ghost chips, and an "Undiscovered"
 * tier that keeps the horizon open: silhouettes you can reveal, "?" slots, and
 * a teaser for the dishes your collection unlocks.
 *
 * Deliberately understated: it celebrates real breadth in your pantry, it never
 * gates a recipe or hides core info. Data is the household's own pantry history
 * via useCollections (reactive, on-device through PowerSync). Animation is the
 * built-in Animated API (native driver, like CookSuccessBurst) and honors
 * Reduce Motion. No network, dark-mode safe, Crumb-styled to match Insights.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  isInSeason,
  peakSeason,
  recipesUsingFood,
  recipesWithinReach,
  signatureRecipe,
  type CollectionSet,
  type MasteryTier,
  type PantryItem,
} from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { useCollections } from './useCollections';
import { CollectionGlyph } from './collectionIcons';
import { RECIPE_CATALOG } from './useRecipeCollections';
import { useReduceMotion } from '../../components/useReduceMotion';
import { BrandLoader, BrandOrnament } from '../../components/BrandDecor';
import { usePantryItems } from '../pantry/usePantryItems';

/** Medal for a set's mastery tier (gold shows as 🏆 next to the title instead). */
function tierMedal(tier: MasteryTier): string | null {
  if (tier === 'bronze') return '🥉';
  if (tier === 'silver') return '🥈';
  return null;
}

/** Gentle looping bob for a collected glyph — offloaded to the UI thread. */
function Bob({ enabled, delay = 0, children }: { enabled: boolean; delay?: number; children: React.ReactNode }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      y.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -3, duration: 1500, delay, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, delay, y]);
  return <Animated.View style={{ transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

export function CollectionsScreen() {
  const { collections, isLoading: collectionsLoading } = useCollections();
  const { items: pantryItems, isLoading: pantryLoading } = usePantryItems();
  const reduce = useReduceMotion();
  const [detail, setDetail] = useState<CollectionSet | null>(null);

  if (collectionsLoading || pantryLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <BrandLoader variant="carousel-dots" />
        </View>
      </SafeAreaView>
    );
  }

  const { varietiesCollected, varietiesTotal, setsComplete, setsTotal, nearestToComplete } =
    collections;

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={collections.sets}
        keyExtractor={(s) => s.food}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={
          <>
            <View style={styles.ornament}>
              <BrandOrnament size={26} opacity={0.5} />
            </View>
            <View style={styles.heroCard}>
              <Text style={styles.heroNumber}>
                {varietiesCollected}
                <Text style={styles.heroTotal}> / {varietiesTotal}</Text>
              </Text>
              <Text style={styles.heroLabel}>varieties collected</Text>
              <Text style={styles.heroSub}>
                {setsComplete > 0
                  ? `${setsComplete} of ${setsTotal} sets complete 🏆`
                  : `${setsTotal} sets to complete`}
              </Text>
            </View>

            {nearestToComplete && (
              <View style={styles.nudgeCard}>
                <Text style={styles.nudgeTitle}>So close!</Text>
                <Text style={styles.nudgeBody}>
                  Just {nearestToComplete.remaining.length} more to finish your{' '}
                  <Text style={styles.nudgeStrong}>{nearestToComplete.title}</Text> set —{' '}
                  {nearestToComplete.remaining.slice(0, 3).join(', ')}
                  {nearestToComplete.remaining.length > 3 ? '…' : ''}.
                </Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>Collections</Text>
          </>
        }
        renderItem={({ item, index }) => (
          <SetCard set={item} index={index} reduce={reduce} onOpen={setDetail} />
        )}
        ListFooterComponent={<UndiscoveredSection reduce={reduce} pantryItems={pantryItems} />}
      />
      <CardBackModal set={detail} onClose={() => setDetail(null)} />
    </SafeAreaView>
  );
}

function SeasonalGlow({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0.15)).current;
  useEffect(() => {
    if (!enabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 1200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.15, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, opacity]);

  if (!enabled) return <>{children}</>;

  return (
    <View style={styles.glowContainer}>
      <Animated.View style={[styles.glowRing, { opacity }]} />
      {children}
    </View>
  );
}

function SetCard({
  set,
  index,
  reduce,
  onOpen,
}: {
  set: CollectionSet;
  index: number;
  reduce: boolean;
  onOpen: (s: CollectionSet) => void;
}) {
  const pct = set.total > 0 ? set.count / set.total : 0;
  const started = set.count > 0;
  const medal = tierMedal(set.tier);
  const season = isInSeason(set.food);

  return (
    <Pressable
      style={styles.card}
      onPress={() => onOpen(set)}
      accessibilityRole="button"
      accessibilityLabel={`${set.title} collection, ${set.count} of ${set.total}`}
      accessibilityHint="Opens details — what's in season and recipes that use it"
    >
      <View style={styles.cardRow}>
        <SeasonalGlow enabled={season === true && !reduce}>
          <View style={[styles.emblem, started && styles.emblemOn, season === true && styles.emblemInSeason]}>
            <Bob enabled={started && !reduce} delay={(index % 5) * 200}>
              <CollectionGlyph name={set.food} collected={started} size={40} />
            </Bob>
            {medal && <Text style={styles.emblemMedal}>{medal}</Text>}
          </View>
        </SeasonalGlow>

        <View style={styles.cardBody}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>
              {set.title} {set.complete && '🏆'}
            </Text>
            <Text style={[styles.cardCount, set.complete && styles.cardCountDone]}>
              {set.count}/{set.total}
            </Text>
          </View>

          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${Math.round(pct * 100)}%` }]} />
          </View>

          <View style={styles.chips}>
            {set.collected.map((kind) => (
              <View key={kind} style={[styles.chip, styles.chipOn]}>
                <Text style={[styles.chipText, styles.chipTextOn]}>✓ {kind}</Text>
              </View>
            ))}
            {set.remaining.map((kind) => (
              <View key={kind} style={[styles.chip, styles.chipOff]}>
                <Text style={[styles.chipText, styles.chipTextOff]}>{kind}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* --------------------------- Card back --------------------------- */

function CardBackModal({ set, onClose }: { set: CollectionSet | null; onClose: () => void }) {
  const season = set ? isInSeason(set.food) : null;
  const peak = set ? peakSeason(set.food) : null;
  // Recipes that use any variety of this food — the food→recipe link.
  const recipes = set ? recipesUsingFood(set.food, RECIPE_CATALOG).slice(0, 6) : [];
  const sigRecipe = set && set.complete ? signatureRecipe(set.food, RECIPE_CATALOG) : null;

  return (
    <Modal visible={set !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {set && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.sheetHead}>
                <View style={[styles.emblem, set.count > 0 && styles.emblemOn]}>
                  <CollectionGlyph name={set.food} collected={set.count > 0} size={40} />
                </View>
                <View style={styles.sheetTitleWrap}>
                  <Text style={styles.sheetTitle}>{set.title}</Text>
                  <Text style={styles.sheetSub}>
                    {set.count}/{set.total} collected · {set.tier}
                  </Text>
                </View>
              </View>

              {season !== null && (
                <View style={[styles.pill, season ? styles.pillOn : styles.pillOff]}>
                  <Text style={season ? styles.pillTextOn : styles.pillTextOff}>
                    {season ? '● In season now' : '○ Out of season'}
                    {peak ? ` · peak in ${peak}` : ''}
                  </Text>
                </View>
              )}

              {sigRecipe && (
                <View style={styles.sigCard}>
                  <Text style={styles.sigTitle}>🏆 Signature Dish Unlocked</Text>
                  <Text style={styles.sigName}>{sigRecipe.title}</Text>
                  <Text style={styles.sigDesc}>
                    You collected every variety of {set?.title}! Try cooking this classic recipe.
                  </Text>
                </View>
              )}

              <Text style={styles.sheetLabel}>Varieties</Text>
              <View style={styles.chips}>
                {set.collected.map((k) => (
                  <View key={k} style={[styles.chip, styles.chipOn]}>
                    <Text style={[styles.chipText, styles.chipTextOn]}>✓ {k}</Text>
                  </View>
                ))}
                {set.remaining.map((k) => (
                  <View key={k} style={[styles.chip, styles.chipOff]}>
                    <Text style={[styles.chipText, styles.chipTextOff]}>{k}</Text>
                  </View>
                ))}
              </View>

              {recipes.length > 0 && (
                <>
                  <Text style={styles.sheetLabel}>Cook with it</Text>
                  {recipes.map((r) => (
                    <Text key={r.id} style={styles.recipeRow}>
                      🍳 {r.title}
                    </Text>
                  ))}
                </>
              )}

              <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button">
                <Text style={styles.closeBtnText}>Close</Text>
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ------------------------- The undiscovered ------------------------- */

interface Discovery {
  glyph: string;
  name: string;
  tease: string;
  kinds: string;
}
const DISCOVERIES: Discovery[] = [
  { glyph: 'avocado', name: 'Avocado', tease: 'a creamy green?', kinds: 'buttery · rich' },
  { glyph: 'pineapple', name: 'Pineapple', tease: 'something tropical', kinds: 'sweet · tangy' },
  { glyph: 'mushroom', name: 'Mushroom', tease: 'found in the shade', kinds: 'earthy · savory' },
  { glyph: 'chili', name: 'Chili', tease: 'brings the heat', kinds: 'spicy · bold' },
];
const PURE = ['Keep exploring', 'More to come'];

function UndiscoveredSection({ reduce, pantryItems }: { reduce: boolean; pantryItems: PantryItem[] }) {
  const pantryNames = pantryItems.map((i) => i.name);
  const withinReach = recipesWithinReach(RECIPE_CATALOG, pantryNames, 2);

  return (
    <View style={styles.footer}>
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>The undiscovered</Text>
        <View style={styles.dividerLine} />
      </View>
      <Text style={styles.subLede}>
        Silhouettes hint at what you could add next — tap to reveal one. The catalog keeps
        growing, and every ingredient you collect quietly opens new dishes to cook.
      </Text>

      {/* Cook teaser — what's possible to cook */}
      <View style={styles.cook}>
        <Text style={styles.cookPot}>🍳</Text>
        <View style={styles.cookBody}>
          <Text style={styles.cookTitle}>Recipes within reach</Text>
          <Text style={styles.cookText}>
            {withinReach.length > 0
              ? 'You are so close to cooking these dishes — just a few ingredients away!'
              : 'New dishes quietly unlock as your shelves fill — collect a little more and see what you can cook.'}
          </Text>
          <View style={styles.cookChips}>
            {withinReach.length > 0 ? (
              withinReach.slice(0, 2).map((match) => (
                <View key={match.recipe.id} style={styles.rchip}>
                  <Text style={styles.rchipText} numberOfLines={1} ellipsizeMode="tail">
                    {match.recipe.title} (need {match.missing.length})
                  </Text>
                </View>
              ))
            ) : (
              <>
                <View style={styles.rchip}><Text style={styles.rchipText}>? · ? · ?</Text></View>
                <View style={styles.rchip}><Text style={styles.rchipText}>? · ? · ?</Text></View>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={styles.mysteryGrid}>
        {DISCOVERIES.map((d) => (
          <MysteryTile key={d.glyph} discovery={d} reduce={reduce} />
        ))}
        {PURE.map((tease) => (
          <View key={tease} style={[styles.mTile, styles.pureTile]}>
            <PurePulse enabled={!reduce}>
              <View style={styles.qbox}><Text style={styles.qboxText}>?</Text></View>
            </PurePulse>
            <Text style={styles.mName}>???</Text>
            <Text style={styles.mKinds}>{tease}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Slow pulse for the pure "?" slots — the catalog keeps growing. */
function PurePulse({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const s = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!enabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(s, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
        Animated.timing(s, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, s]);
  return <Animated.View style={{ transform: [{ scale: s }] }}>{children}</Animated.View>;
}

function MysteryTile({ discovery, reduce }: { discovery: Discovery; reduce: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const spark = useRef(new Animated.Value(0)).current;

  const reveal = () => {
    if (revealed) return;
    setRevealed(true);
    if (reduce) return;
    scale.setValue(0.7);
    spark.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 120, friction: 6, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(spark, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(spark, { toValue: 0, duration: 380, useNativeDriver: true }),
      ]),
    ]).start();
  };

  return (
    <Pressable
      onPress={reveal}
      style={[styles.mTile, revealed && styles.mTileOn]}
      accessibilityRole="button"
      accessibilityLabel={revealed ? `${discovery.name} — discovered` : 'Undiscovered — tap to reveal'}
    >
      <Animated.View style={[styles.mGlyphWrap, { transform: [{ scale }] }]}>
        <View style={revealed ? undefined : styles.silhouette}>
          <CollectionGlyph name={discovery.glyph} collected={revealed} size={40} />
        </View>
        {!revealed && (
          <View style={styles.qOverlay} pointerEvents="none">
            <Text style={styles.qOverlayText}>?</Text>
          </View>
        )}
        <Animated.Text
          style={[styles.spark, { opacity: spark, transform: [{ scale: spark }] }]}
          pointerEvents="none"
        >
          ✦
        </Animated.Text>
      </Animated.View>
      <Text style={styles.mName}>{revealed ? discovery.name : '???'}</Text>
      <Text style={[styles.mKinds, !revealed && styles.mTease]}>
        {revealed ? discovery.kinds : discovery.tease}
      </Text>
    </Pressable>
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

  // Hero
  heroCard: {
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.lg,
    padding: tokens.space(6),
    alignItems: 'center',
    marginBottom: tokens.space(4),
  },
  heroNumber: {
    fontFamily: tokens.font.display.bold,
    fontSize: 56,
    color: tokens.color.onAccent,
    letterSpacing: -2,
    lineHeight: 60,
  },
  heroTotal: { fontFamily: tokens.font.display.semibold, fontSize: 30, color: tokens.color.onAccent, opacity: 0.6 },
  heroLabel: {
    fontFamily: tokens.font.body.medium,
    fontSize: 15,
    color: tokens.color.onAccent,
    opacity: 0.85,
    marginTop: tokens.space(1),
  },
  heroSub: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    color: tokens.color.onAccent,
    opacity: 0.65,
    marginTop: tokens.space(2),
  },

  // Nudge
  nudgeCard: { backgroundColor: tokens.color.accentSoft, borderRadius: tokens.radius.md, padding: tokens.space(4), marginBottom: tokens.space(5) },
  nudgeTitle: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.accent, marginBottom: tokens.space(1) },
  nudgeBody: { fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.ink, lineHeight: 19 },
  nudgeStrong: { fontFamily: tokens.font.body.semibold },

  sectionTitle: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(3),
  },

  // Set card
  card: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
    marginBottom: tokens.space(3),
  },
  cardRow: { flexDirection: 'row', gap: tokens.space(3) },
  emblem: {
    width: 52,
    height: 52,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemOn: { backgroundColor: tokens.color.accentSoft },
  cardBody: { flex: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.space(2) },
  cardTitle: { fontFamily: tokens.font.display.semibold, fontSize: 16, color: tokens.color.ink },
  cardCount: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.inkMuted },
  cardCountDone: { color: tokens.color.success },

  track: { height: 4, borderRadius: 2, backgroundColor: tokens.color.line, overflow: 'hidden', marginBottom: tokens.space(3) },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: tokens.color.accent },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  chip: { paddingHorizontal: tokens.space(3), paddingVertical: tokens.space(1), borderRadius: tokens.radius.sm },
  chipOn: { backgroundColor: tokens.color.accentSoft },
  chipOff: { backgroundColor: tokens.color.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.color.line },
  chipText: { fontFamily: tokens.font.body.medium, fontSize: 13 },
  chipTextOn: { color: tokens.color.accent },
  chipTextOff: { color: tokens.color.inkMuted },

  // Undiscovered
  footer: { marginTop: tokens.space(6) },
  divider: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3), marginBottom: tokens.space(2) },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: tokens.color.line },
  dividerText: { fontFamily: tokens.font.display.semibold, fontSize: 14, color: tokens.color.ink },
  subLede: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: tokens.space(4),
  },

  cook: {
    flexDirection: 'row',
    gap: tokens.space(3),
    backgroundColor: tokens.color.accentSoft,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
    marginBottom: tokens.space(4),
  },
  cookPot: { fontSize: 28, lineHeight: 32 },
  cookBody: { flex: 1 },
  cookTitle: { fontFamily: tokens.font.display.semibold, fontSize: 15, color: tokens.color.ink, marginBottom: 2 },
  cookText: { fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.ink, opacity: 0.82, lineHeight: 18 },
  cookChips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2), marginTop: tokens.space(2) },
  rchip: { backgroundColor: tokens.color.surface, borderRadius: 999, paddingHorizontal: tokens.space(3), paddingVertical: tokens.space(1), flexShrink: 1, maxWidth: '100%' },
  rchipText: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.accent, letterSpacing: 1 },

  mysteryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(3) },
  mTile: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space(4),
    alignItems: 'center',
    gap: tokens.space(2),
  },
  mTileOn: { backgroundColor: tokens.color.surfaceAlt, borderColor: tokens.color.accentSoft },
  pureTile: { justifyContent: 'center' },
  mGlyphWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  silhouette: { opacity: 0.42 },
  qOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  qOverlayText: { fontFamily: tokens.font.display.bold, fontSize: 24, color: tokens.color.inkMuted },
  spark: { position: 'absolute', top: -6, right: -8, fontSize: 15, color: '#E0B85A' },
  qbox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.surfaceAlt,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: tokens.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qboxText: { fontFamily: tokens.font.display.bold, fontSize: 22, color: tokens.color.inkMuted },
  mName: { fontFamily: tokens.font.display.semibold, fontSize: 14, color: tokens.color.ink },
  mKinds: { fontFamily: tokens.font.body.regular, fontSize: 11, color: tokens.color.inkMuted },
  mTease: { fontStyle: 'italic' },

  // Mastery medal on the emblem
  emblemMedal: { position: 'absolute', top: -6, right: -6, fontSize: 15 },

  // Card back (modal)
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    padding: tokens.space(6),
    maxHeight: '82%',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3), marginBottom: tokens.space(4) },
  sheetTitleWrap: { flex: 1 },
  sheetTitle: { fontFamily: tokens.font.display.bold, fontSize: 22, color: tokens.color.ink },
  sheetSub: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.inkMuted, marginTop: 2, textTransform: 'capitalize' },

  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: tokens.space(3), paddingVertical: tokens.space(1), marginBottom: tokens.space(5) },
  pillOn: { backgroundColor: tokens.color.accentSoft },
  pillOff: { backgroundColor: tokens.color.surfaceAlt },
  pillTextOn: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.accent },
  pillTextOff: { fontFamily: tokens.font.body.medium, fontSize: 12, color: tokens.color.inkMuted },

  sheetLabel: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginTop: tokens.space(4),
    marginBottom: tokens.space(2),
  },
  recipeRow: {
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.color.ink,
    paddingVertical: tokens.space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  closeBtn: {
    marginTop: tokens.space(6),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space(4),
    alignItems: 'center',
  },
  closeBtnText: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },

  // Seasonal glow
  glowContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: tokens.radius.md + 4,
    backgroundColor: '#E0B85A',
  },
  emblemInSeason: {
    borderColor: '#E0B85A',
    borderWidth: 1.5,
  },

  // Signature card back
  sigCard: {
    backgroundColor: tokens.color.accentSoft,
    borderWidth: 1.5,
    borderColor: '#E0B85A',
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
    marginBottom: tokens.space(5),
  },
  sigTitle: {
    fontFamily: tokens.font.display.bold,
    fontSize: 14,
    color: tokens.color.accent,
    marginBottom: tokens.space(1),
  },
  sigName: {
    fontFamily: tokens.font.display.bold,
    fontSize: 18,
    color: tokens.color.ink,
    marginBottom: tokens.space(1),
  },
  sigDesc: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    lineHeight: 18,
  },
});

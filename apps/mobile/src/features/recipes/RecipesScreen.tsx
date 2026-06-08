/**
 * RecipesScreen — "Cook This" with time-of-day awareness, meal-type filtering,
 * swipeable suggestions, and on-device learning.
 *
 * The query defaults to the meal that fits the current time (breakfast / entrée /
 * snack) via @breadbox/core mealtime, and the user can switch with the meal chips
 * (Any / Breakfast / Entrée / Dessert / Snack) — driving Spoonacular's complexSearch
 * `type` filter so an entrée request actually returns entrées, not whatever maximized
 * ingredient use. Results are still re-ranked by learned preference (recipePrefs) and
 * shown in a swipeable pager with ♥ Like / ✕ Skip / View.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  defaultMealForHour,
  getExpiryStatus,
  mealtimeLabel,
  scoreTitle,
  type MealType,
  type PantryItem,
  type PrefEvent,
  type RecipePrefs,
} from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { powerSyncPantry } from '../../data/powerSyncPantry';
import { searchByMeal } from '../../data/spoonacular/client';
import type { SpoonacularRecipe } from '../../data/spoonacular/types';
import { formatExpiryMeta } from '../pantry/expiryFormat';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useRecipePrefs } from './useRecipePrefs';

const CARD_W = Dimensions.get('window').width;

type MealChoice = MealType | 'any';

const MEALS: Array<{ label: string; value: MealChoice }> = [
  { label: 'Any', value: 'any' },
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Entrée', value: 'main course' },
  { label: 'Dessert', value: 'dessert' },
  { label: 'Snack', value: 'snack' },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; recipes: SpoonacularRecipe[]; items: PantryItem[] }
  | { kind: 'empty'; itemCount: number }
  | { kind: 'error'; message: string };

function recipeUrl(r: SpoonacularRecipe): string {
  const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `https://spoonacular.com/recipes/${slug}-${r.id}`;
}

function pickUrgent(items: PantryItem[], now: Date): PantryItem | undefined {
  return items
    .filter((i) => i.expiresAt && getExpiryStatus(i, now) !== 'fresh')
    .sort((a, b) => new Date(a.expiresAt as string).getTime() - new Date(b.expiresAt as string).getTime())[0];
}

function lowerFirst(s: string | undefined): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : '';
}

function matchLine(r: SpoonacularRecipe): string {
  const total = r.usedIngredientCount + r.missedIngredientCount;
  const base = `Uses ${r.usedIngredientCount} of ${total} ingredients`;
  return r.missedIngredientCount > 0 ? `${base} · need ${r.missedIngredientCount} more` : base;
}

export function RecipesScreen() {
  const { activeHouseholdId } = useActiveHousehold();
  const { prefs, record } = useRecipePrefs(activeHouseholdId);
  const hour = useMemo(() => new Date().getHours(), []);
  const [meal, setMeal] = useState<MealChoice>(() => defaultMealForHour(hour));
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const items = await powerSyncPantry.list();
        if (items.length === 0) {
          if (!cancelled) setState({ kind: 'empty', itemCount: 0 });
          return;
        }
        const recipes = await searchByMeal(items.map((i) => i.name), {
          type: meal === 'any' ? undefined : meal,
          number: 8,
        });
        if (cancelled) return;
        if (recipes.length === 0) setState({ kind: 'empty', itemCount: items.length });
        else setState({ kind: 'ok', recipes, items });
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meal]);

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <View style={styles.headerPad}>
        <Text style={styles.eyebrow}>{`Cook this · ${mealtimeLabel(hour)}`}</Text>
        <View style={styles.chips}>
          {MEALS.map((m) => {
            const selected = m.value === meal;
            return (
              <Pressable
                key={m.value}
                onPress={() => setMeal(m.value)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {state.kind === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.accent} />
          <Text style={styles.helper}>Finding what you can cook…</Text>
        </View>
      )}

      {state.kind === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn't load recipes</Text>
          <Text style={styles.helper}>{state.message}</Text>
        </View>
      )}

      {state.kind === 'empty' && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{state.itemCount === 0 ? 'Nothing to cook yet' : 'No matches found'}</Text>
          <Text style={styles.helper}>
            {state.itemCount === 0
              ? "Add a few items to your pantry and we'll suggest recipes from what you have."
              : `No ${meal === 'any' ? 'matches' : `${meal} ideas`} from your pantry right now — try another meal type above.`}
          </Text>
        </View>
      )}

      {state.kind === 'ok' && <CookThis recipes={state.recipes} items={state.items} prefs={prefs} record={record} />}
    </SafeAreaView>
  );
}

function CookThis({
  recipes,
  items,
  prefs,
  record,
}: {
  recipes: SpoonacularRecipe[];
  items: PantryItem[];
  prefs: RecipePrefs;
  record: (title: string, event: PrefEvent) => void;
}) {
  const now = useMemo(() => new Date(), []);
  const urgent = pickUrgent(items, now);
  const reason = urgent ? `Because your ${urgent.name.toLowerCase()} ${lowerFirst(formatExpiryMeta(urgent, now))}` : null;
  const reasonColor =
    urgent && getExpiryStatus(urgent, now) === 'expired' ? tokens.semantic.expiry.expired : tokens.semantic.expiry.warning;

  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);

  const pool = useMemo(
    () =>
      [...recipes].sort(
        (a, b) =>
          scoreTitle(prefs, b.title) * 1.5 +
          b.usedIngredientCount -
          (scoreTitle(prefs, a.title) * 1.5 + a.usedIngredientCount),
      ),
    [recipes, prefs],
  );

  const top = pool.slice(0, 3);
  const alternates = pool.slice(3);

  function onLike(r: SpoonacularRecipe) {
    record(r.title, 'like');
    setLiked((prev) => new Set(prev).add(r.id));
  }
  function onSkip(r: SpoonacularRecipe) {
    record(r.title, 'skip');
    setSkipped((prev) => new Set(prev).add(r.id));
  }
  function onOpen(r: SpoonacularRecipe) {
    record(r.title, 'open');
    Linking.openURL(recipeUrl(r));
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {reason && (
        <View style={styles.reasonPad}>
          <Text style={[styles.reason, { color: reasonColor }]}>{reason}</Text>
        </View>
      )}
      <Text style={styles.swipeHint}>Swipe through your top picks — ♥ and ✕ teach us what you like.</Text>

      <FlatList
        data={top}
        keyExtractor={(r) => String(r.id)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / CARD_W))}
        renderItem={({ item }) => (
          <HeroCard
            recipe={item}
            liked={liked.has(item.id)}
            skipped={skipped.has(item.id)}
            onLike={onLike}
            onSkip={onSkip}
            onOpen={onOpen}
          />
        )}
      />

      {top.length > 1 && (
        <View style={styles.dots}>
          {top.map((r, i) => (
            <View key={r.id} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
      )}

      {alternates.length > 0 && (
        <View style={styles.altsPad}>
          <Text style={styles.altHead}>More from your pantry</Text>
          {alternates.map((r) => (
            <Pressable key={r.id} style={styles.altRow} onPress={() => onOpen(r)}>
              <Image source={{ uri: r.image }} style={styles.altThumb} />
              <View style={styles.altText}>
                <Text style={styles.altName} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={styles.altMeta}>{matchLine(r)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function HeroCard({
  recipe,
  liked,
  skipped,
  onLike,
  onSkip,
  onOpen,
}: {
  recipe: SpoonacularRecipe;
  liked: boolean;
  skipped: boolean;
  onLike: (r: SpoonacularRecipe) => void;
  onSkip: (r: SpoonacularRecipe) => void;
  onOpen: (r: SpoonacularRecipe) => void;
}) {
  return (
    <View style={styles.cardPage}>
      <Pressable style={[styles.hero, skipped && styles.heroDim]} onPress={() => onOpen(recipe)}>
        <Image source={{ uri: recipe.image }} style={styles.heroImg} />
        <View style={styles.heroPad}>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {recipe.title}
          </Text>
          <Text style={styles.match}>{matchLine(recipe)}</Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable style={[styles.actBtn, liked && styles.actBtnLiked]} onPress={() => onLike(recipe)}>
          <Text style={[styles.actTxt, liked && styles.actTxtLiked]}>{liked ? '♥ Liked' : '♥ Like'}</Text>
        </Pressable>
        <Pressable style={[styles.actBtn, skipped && styles.actBtnSkipped]} onPress={() => onSkip(recipe)}>
          <Text style={styles.actTxt}>{skipped ? '✕ Skipped' : '✕ Skip'}</Text>
        </Pressable>
        <Pressable style={[styles.actBtn, styles.viewBtn]} onPress={() => onOpen(recipe)}>
          <Text style={[styles.actTxt, styles.viewTxt]}>View →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.space(8) },
  helper: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    marginTop: tokens.space(2),
    textAlign: 'center',
    lineHeight: 18,
  },
  errorTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 18,
    color: tokens.color.ink,
    marginBottom: tokens.space(2),
    textAlign: 'center',
  },
  headerPad: { paddingHorizontal: tokens.space(6), paddingTop: tokens.space(6), paddingBottom: tokens.space(3) },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: tokens.color.accent,
    marginBottom: tokens.space(3),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  chip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  chipSelected: { backgroundColor: tokens.color.accent },
  chipText: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  chipTextSelected: { color: tokens.color.onAccent },
  scroll: { paddingBottom: tokens.space(10) },
  reasonPad: { paddingHorizontal: tokens.space(6) },
  reason: { fontFamily: tokens.font.body.semibold, fontSize: 14, lineHeight: 19, marginBottom: tokens.space(2) },
  swipeHint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 12.5,
    color: tokens.color.inkMuted,
    lineHeight: 17,
    paddingHorizontal: tokens.space(6),
    marginBottom: tokens.space(4),
  },
  cardPage: { width: CARD_W, paddingHorizontal: tokens.space(6) },
  hero: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.line,
  },
  heroDim: { opacity: 0.5 },
  heroImg: { width: '100%', height: 170, backgroundColor: tokens.color.line },
  heroPad: { padding: tokens.space(4) },
  heroTitle: {
    fontFamily: tokens.font.display.bold,
    fontSize: 21,
    color: tokens.color.ink,
    letterSpacing: -0.3,
    lineHeight: 25,
  },
  match: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted, marginTop: tokens.space(2) },
  actions: { flexDirection: 'row', gap: tokens.space(2), marginTop: tokens.space(3) },
  actBtn: {
    flex: 1,
    paddingVertical: tokens.space(3),
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surfaceAlt,
    alignItems: 'center',
  },
  actBtnLiked: { backgroundColor: tokens.color.accentSoft },
  actBtnSkipped: { opacity: 0.6 },
  viewBtn: { backgroundColor: tokens.color.accent },
  actTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.ink },
  actTxtLiked: { color: tokens.color.accent },
  viewTxt: { color: tokens.color.onAccent },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: tokens.space(2), marginTop: tokens.space(4) },
  dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: tokens.color.line },
  dotActive: { backgroundColor: tokens.color.accent },
  altsPad: { paddingHorizontal: tokens.space(6), marginTop: tokens.space(7) },
  altHead: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  altRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  altThumb: { width: 56, height: 56, borderRadius: tokens.radius.md, backgroundColor: tokens.color.line },
  altText: { flex: 1 },
  altName: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.ink },
  altMeta: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted, marginTop: 2 },
});

/**
 * RecipesScreen — "Cook This": time-of-day aware, meal-type filtered, swipeable,
 * learning suggestions, with ingredient controls. As of Phase 2 this is the
 * permanent Cook TAB (see navigation/MainTabs), not a pushed screen.
 *
 * You can drop pantry ingredients from the search (tap a chip to leave out
 * e.g. bananas) and Refresh for new ideas (pages Spoonacular's results via
 * offset). The reason line follows the ingredients you're actually cooking with.
 *
 * Tapping a recipe (hero, "View", or an alternate row) opens the in-app
 * RecipeDetail screen (ingredients, steps, time, source) — no more bouncing out
 * to spoonacular.com. The full recipe data rides along on the search response,
 * so detail opens instantly with no extra fetch.
 *
 * "I cooked this" (the loop-closer): each hero card carries a confirm action
 * that opens CookedItSheet — matched pantry items get marked used-up /
 * decremented through PowerSync.
 *
 * Pantry data is REACTIVE via usePantryItems (a persistent tab can't afford the
 * old one-shot snapshot — chips/reason line would go stale after a cook or an
 * edit). To keep reactivity from hammering Spoonacular, the recipe fetch keys
 * on a stable signature of the pantry's distinct ingredient NAMES: quantity
 * changes and expiry edits re-render the chips/reason instantly but do NOT
 * refetch; an ingredient appearing or disappearing (added, fully used up)
 * does — at which point fresh suggestions are exactly what you want.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Heart,
  Leaf,
  Plus,
  RefreshCw,
  Users,
  X,
} from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  defaultMealForHour,
  getExpiryStatus,
  matchCookedItems,
  mealtimeLabel,
  scoreTitle,
  type MealType,
  type PantryItem,
  type PrefEvent,
  type RecipePrefs,
} from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { CookEmptyArt } from '../../components/illustrations/CookEmptyArt';
import { searchByMeal } from '../../data/spoonacular/client';
import type { SpoonacularRecipe } from '../../data/spoonacular/types';
import { formatExpiryMeta } from '../pantry/expiryFormat';
import { usePantryItems } from '../pantry/usePantryItems';
import { addToShoppingList } from '../shopping/addToShoppingList';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { useRecipePrefs } from './useRecipePrefs';
import { CookErrorArt } from '../../components/illustrations/CookErrorArt';
import { CookedItSheet, type CookedSheetItem } from './CookedItSheet';
import { CookSuccessBurst } from './CookSuccessBurst';
import { CookSkeleton } from './CookSkeleton';
import type { RootStackParamList } from '../../../App';

const CARD_W = Dimensions.get('window').width;
const PAGE = 8;

type MealChoice = MealType | 'any';

const MEALS: Array<{ label: string; value: MealChoice }> = [
  { label: 'Any', value: 'any' },
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Entrée', value: 'main course' },
  { label: 'Dessert', value: 'dessert' },
  { label: 'Snack', value: 'snack' },
];

type RecipeState =
  | { kind: 'loading' }
  | { kind: 'ok'; recipes: SpoonacularRecipe[] }
  | { kind: 'empty'; reason: 'no-pantry' | 'all-excluded' | 'no-match' }
  | { kind: 'error'; message: string };

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
  const { state: authState } = useAuth();
  const userId = authState.status === 'authenticated' ? authState.session.user.id : null;
  const { prefs, record } = useRecipePrefs(activeHouseholdId);

  const { items, isLoading: pantryLoading, error: pantryError } = usePantryItems();

  const [hour, setHour] = useState(() => new Date().getHours());
  const [meal, setMeal] = useState<MealChoice>(() => defaultMealForHour(hour));
  const userPickedMeal = useRef(false);

  // Re-evaluate the time-of-day default each time the Cook tab is focused — a
  // tab mounted at app launch would otherwise keep the launch-time meal +
  // eyebrow forever. We never override a meal the user picked themselves.
  useFocusEffect(
    useCallback(() => {
      const h = new Date().getHours();
      setHour(h);
      if (!userPickedMeal.current) setMeal(defaultMealForHour(h));
    }, []),
  );
  const [healthy, setHealthy] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]); // lowercased names
  const [offset, setOffset] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [recipeState, setRecipeState] = useState<RecipeState>({ kind: 'loading' });
  // Cook confirmation lives HERE (not in CookThis) so it survives the refetch a
  // cook can trigger: finishing an item changes the pantry name-set, which
  // remounts CookThis and would otherwise drop the success burst.
  const [cooked, setCooked] = useState<{ count: number; key: number } | null>(null);

  const excludedKey = excluded.join('|');

  // Stable fingerprint of the pantry's DISTINCT ingredient names — the only
  // pantry dimension the recipe search actually depends on. Keying the fetch
  // effect on this (not on the reactive `items` array identity, which changes
  // on every emission) is what keeps live pantry updates from refetching.
  const pantrySignature = useMemo(
    () => [...new Set(items.map((i) => i.name.toLowerCase()))].sort().join('|'),
    [items],
  );

  const activeItems = useMemo(
    () => items.filter((i) => !excluded.includes(i.name.toLowerCase())),
    [items, excludedKey],
  );

  // Query recipes when the pantry's name-set, meal, exclusions, or page change.
  useEffect(() => {
    if (pantryLoading) return;
    if (pantryError) {
      setRecipeState({ kind: 'error', message: pantryError.message });
      return;
    }
    let cancelled = false;
    if (items.length === 0) {
      setRecipeState({ kind: 'empty', reason: 'no-pantry' });
      return;
    }
    const names = items.filter((i) => !excluded.includes(i.name.toLowerCase())).map((i) => i.name);
    if (names.length === 0) {
      setRecipeState({ kind: 'empty', reason: 'all-excluded' });
      return;
    }
    setRecipeState({ kind: 'loading' });
    (async () => {
      try {
        const recipes = await searchByMeal(names, {
          type: meal === 'any' ? undefined : meal,
          number: PAGE,
          offset,
        });
        if (cancelled) return;
        setRecipeState(recipes.length === 0 ? { kind: 'empty', reason: 'no-match' } : { kind: 'ok', recipes });
      } catch (e) {
        if (!cancelled) setRecipeState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantryLoading, pantryError, pantrySignature, meal, excludedKey, offset]);

  // Auto-dismiss the cook confirmation once it's had time to play + read.
  useEffect(() => {
    if (!cooked) return;
    const t = setTimeout(() => setCooked(null), 2600);
    return () => clearTimeout(t);
  }, [cooked]);

  function changeMeal(m: MealChoice) {
    userPickedMeal.current = true;
    setMeal(m);
    setOffset(0);
  }
  function toggleExclude(name: string) {
    const k = name.toLowerCase();
    setExcluded((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
    setOffset(0);
  }
  function refresh() {
    setOffset((o) => o + PAGE);
  }
  function reset() {
    setExcluded([]);
    setOffset(0);
  }

  const canReset = excluded.length > 0 || offset > 0;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.headerPad}>
        <Text style={styles.screenTitle}>Cook</Text>
        <Text style={styles.eyebrow}>{`Cook this · ${mealtimeLabel(hour)}`}</Text>
        <View style={styles.chips}>
          {MEALS.map((m) => {
            const selected = m.value === meal;
            return (
              <Pressable key={m.value} onPress={() => changeMeal(m.value)} style={[styles.chip, selected && styles.chipSelected]}>
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.controls}>
          <Pressable style={styles.ctrlBtn} onPress={refresh}>
            <View style={styles.ctrlInner}>
              <RefreshCw size={13} color={tokens.color.accent} />
              <Text style={styles.ctrlBtnTxt}>Refresh</Text>
            </View>
          </Pressable>
          <Pressable style={styles.ctrlBtn} onPress={() => setShowIngredients((v) => !v)}>
            <View style={styles.ctrlInner}>
              <Text style={styles.ctrlBtnTxt}>Ingredients · {items.length}</Text>
              {showIngredients ? (
                <ChevronUp size={13} color={tokens.color.accent} />
              ) : (
                <ChevronDown size={13} color={tokens.color.accent} />
              )}
            </View>
          </Pressable>
          <Pressable
            style={[styles.ctrlBtn, healthy && styles.ctrlBtnOn]}
            onPress={() => setHealthy((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: healthy }}
            accessibilityLabel="Healthier picks"
          >
            <View style={styles.ctrlInner}>
              <Leaf size={13} color={healthy ? tokens.color.onAccent : tokens.color.accent} />
              <Text style={[styles.ctrlBtnTxt, healthy && styles.ctrlBtnTxtOn]}>Healthy</Text>
            </View>
          </Pressable>
          {canReset && (
            <Pressable hitSlop={6} onPress={reset}>
              <Text style={styles.resetTxt}>Reset</Text>
            </Pressable>
          )}
        </View>

        {showIngredients && items.length > 0 && (
          <View style={styles.ingWrap}>
            <Text style={styles.ingHint}>Tap an ingredient to leave it out of suggestions.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ingRow}>
              {items.map((i) => {
                const out = excluded.includes(i.name.toLowerCase());
                return (
                  <Pressable key={i.id} onPress={() => toggleExclude(i.name)} style={[styles.ingChip, out && styles.ingChipOut]}>
                    <Text style={[styles.ingChipTxt, out && styles.ingChipTxtOut]}>{out ? `+ ${i.name}` : `${i.name}  ✕`}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {cooked && <CookSuccessBurst key={cooked.key} itemCount={cooked.count} />}

      {recipeState.kind === 'loading' && <CookSkeleton />}

      {recipeState.kind === 'error' && (
        <View style={styles.center}>
          <CookErrorArt />
          <Text style={styles.errorTitle}>Couldn't load recipes</Text>
          <Text style={styles.helper}>{recipeState.message}</Text>
        </View>
      )}

      {recipeState.kind === 'empty' && (
        <View style={styles.center}>
          <CookEmptyArt />
          <Text style={styles.errorTitle}>
            {recipeState.reason === 'no-pantry'
              ? 'Your pantry is the menu'
              : recipeState.reason === 'all-excluded'
                ? "Everything's on the bench"
                : "That's everything we found"}
          </Text>
          <Text style={styles.helper}>
            {recipeState.reason === 'no-pantry'
              ? "Add what's in your fridge and we'll figure out dinner."
              : recipeState.reason === 'all-excluded'
                ? "You excluded all your ingredients — bring some back or hit Reset."
                : "Try a different meal type, bring back an ingredient, or hit Refresh for new inspiration."}
          </Text>
          {canReset && (
            <Pressable style={styles.resetBtn} onPress={reset}>
              <Text style={styles.resetBtnTxt}>Reset</Text>
            </Pressable>
          )}
        </View>
      )}

      {recipeState.kind === 'ok' && (
        <CookThis
          recipes={recipeState.recipes}
          items={activeItems}
          prefs={prefs}
          record={record}
          householdId={activeHouseholdId}
          userId={userId}
          healthy={healthy}
          onCookComplete={(n) => setCooked(n > 0 ? { count: n, key: Date.now() } : null)}
        />
      )}
    </SafeAreaView>
  );
}

function CookThis({
  recipes,
  items,
  prefs,
  record,
  householdId,
  userId,
  healthy,
  onCookComplete,
}: {
  recipes: SpoonacularRecipe[];
  items: PantryItem[];
  prefs: RecipePrefs;
  record: (title: string, event: PrefEvent) => void;
  householdId: string | null;
  userId: string | null;
  healthy: boolean;
  onCookComplete: (updatedCount: number) => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // Re-anchored whenever the (reactive) pantry changes — a persistent tab can
  // sit mounted across midnight, so a fixed `new Date()` would drift.
  const now = useMemo(() => new Date(), [items]);
  const urgent = pickUrgent(items, now);
  const reason = urgent ? `Because your ${urgent.name.toLowerCase()} ${lowerFirst(formatExpiryMeta(urgent, now))}` : null;
  const reasonColor =
    urgent && getExpiryStatus(urgent, now) === 'expired' ? tokens.semantic.expiry.expired : tokens.semantic.expiry.warning;

  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const [cooking, setCooking] = useState<SpoonacularRecipe | null>(null);
  // Recipes whose missing ingredients were added to the shopping list (feedback).
  const [missingAdded, setMissingAdded] = useState<Set<number>>(new Set());

  /** What's-missing → shopping list, dedupe-aware, source 'recipe'. */
  async function onAddMissing(r: SpoonacularRecipe) {
    if (!householdId || !userId || r.missedIngredientNames.length === 0) return;
    Haptics.selectionAsync().catch(() => {});
    for (const name of r.missedIngredientNames) {
      await addToShoppingList({ householdId, userId, name, source: 'recipe' });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setMissingAdded((prev) => new Set(prev).add(r.id));
  }

  const pool = useMemo(() => {
    // Healthy mode: drop low-scoring recipes (unless that would empty the
    // list — badges still tell the story) and boost healthiness in the blend.
    // Pantry-match still dominates: this is greener Cook This, not a diet app.
    // Same cached response serves both toggle states — zero extra quota.
    let candidates = recipes;
    if (healthy) {
      const fit = recipes.filter((r) => (r.healthScore ?? 0) >= 35);
      if (fit.length > 0) candidates = fit;
    }
    const blend = (r: SpoonacularRecipe) =>
      scoreTitle(prefs, r.title) * 1.5 +
      r.usedIngredientCount +
      (healthy ? ((r.healthScore ?? 0) / 100) * 6 : 0);
    return [...candidates].sort((a, b) => blend(b) - blend(a));
  }, [recipes, prefs, healthy]);

  const top = pool.slice(0, 3);
  const alternates = pool.slice(3);

  // Rows for the cooked-it sheet: matched pantry items (pre-selected) when the
  // API gave us ingredient names, otherwise the full active pantry defaulting
  // to "Kept" so the user can mark things manually.
  const sheetItems = useMemo<CookedSheetItem[]>(() => {
    if (!cooking) return [];
    const matches = matchCookedItems(
      cooking.usedIngredientNames,
      items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity })),
    );
    if (matches.length > 0) {
      return matches.map((m) => ({
        itemId: m.itemId,
        itemName: m.itemName,
        quantity: m.quantity,
        matched: true,
        matchedIngredient: m.matchedIngredient,
      }));
    }
    return items.map((i) => ({ itemId: i.id, itemName: i.name, quantity: i.quantity, matched: false }));
  }, [cooking, items]);

  function onLike(r: SpoonacularRecipe) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    record(r.title, 'like');
    setLiked((prev) => new Set(prev).add(r.id));
  }
  function onSkip(r: SpoonacularRecipe) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    record(r.title, 'skip');
    setSkipped((prev) => new Set(prev).add(r.id));
  }
  function onOpen(r: SpoonacularRecipe) {
    record(r.title, 'open');
    navigation.navigate('RecipeDetail', { recipe: r });
  }
  function onCooked(r: SpoonacularRecipe) {
    setCooking(r);
  }
  function onCookDone(r: SpoonacularRecipe, updatedCount: number) {
    // Cooking a recipe is the strongest preference signal we collect.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    record(r.title, 'like');
    setCooking(null);
    onCookComplete(updatedCount);
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {reason && (
        <View style={styles.reasonPad}>
          <Text style={[styles.reason, { color: reasonColor }]}>{reason}</Text>
        </View>
      )}
      <Text style={styles.swipeHint}>Swipe to browse — like what looks good, skip what doesn't. We learn your taste.</Text>

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
            missingAdded={missingAdded.has(item.id)}
            onLike={onLike}
            onSkip={onSkip}
            onOpen={onOpen}
            onCooked={onCooked}
            onAddMissing={(r) => void onAddMissing(r)}
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
                <Text style={styles.altMeta} numberOfLines={1}>
                  {r.readyInMinutes !== null ? `${r.readyInMinutes} min · ` : ''}
                  {matchLine(r)}
                  {r.healthScore !== null && r.healthScore >= 70 ? ' · very healthy' : ''}
                </Text>
              </View>
              <ChevronRight size={18} color={tokens.color.inkMuted} />
            </Pressable>
          ))}
        </View>
      )}

      {cooking && (
        <CookedItSheet
          recipeId={cooking.id}
          recipeTitle={cooking.title}
          items={sheetItems}
          householdId={householdId}
          onClose={() => setCooking(null)}
          onDone={(n) => onCookDone(cooking, n)}
        />
      )}
    </ScrollView>
  );
}

function HeroCard({
  recipe,
  liked,
  skipped,
  missingAdded,
  onLike,
  onSkip,
  onOpen,
  onCooked,
  onAddMissing,
}: {
  recipe: SpoonacularRecipe;
  liked: boolean;
  skipped: boolean;
  missingAdded: boolean;
  onLike: (r: SpoonacularRecipe) => void;
  onSkip: (r: SpoonacularRecipe) => void;
  onOpen: (r: SpoonacularRecipe) => void;
  onCooked: (r: SpoonacularRecipe) => void;
  onAddMissing: (r: SpoonacularRecipe) => void;
}) {
  return (
    <View style={styles.cardPage}>
      <Pressable style={[styles.hero, skipped && styles.heroDim]} onPress={() => onOpen(recipe)}>
        <View style={styles.heroImgWrap}>
          <Image source={{ uri: recipe.image }} style={styles.heroImg} />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.82)'] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.heroScrim}
          >
            <Text style={styles.heroTitleOnImg} numberOfLines={2}>
              {recipe.title}
            </Text>
          </LinearGradient>
        </View>
        <View style={styles.heroPad}>
          {(recipe.readyInMinutes !== null ||
            recipe.servings !== null ||
            (recipe.healthScore !== null && recipe.healthScore >= 55)) && (
            <View style={styles.metaRow}>
              {recipe.readyInMinutes !== null && (
                <View style={styles.metaChip}>
                  <Clock size={12} color={tokens.color.inkMuted} />
                  <Text style={styles.metaTxt}>{recipe.readyInMinutes} min</Text>
                </View>
              )}
              {recipe.servings !== null && (
                <View style={styles.metaChip}>
                  <Users size={12} color={tokens.color.inkMuted} />
                  <Text style={styles.metaTxt}>Serves {recipe.servings}</Text>
                </View>
              )}
              {recipe.healthScore !== null && recipe.healthScore >= 55 && (
                <View style={styles.metaChip}>
                  <Leaf size={12} color={tokens.color.success} />
                  <Text style={[styles.metaTxt, styles.metaTxtHealth]}>
                    {recipe.healthScore >= 70 ? 'Very healthy' : 'Healthy'} · {recipe.healthScore}
                  </Text>
                </View>
              )}
            </View>
          )}
          <Text style={styles.match}>{matchLine(recipe)}</Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          style={[styles.actBtn, liked && styles.actBtnLiked]}
          onPress={() => onLike(recipe)}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={liked ? 'Liked' : 'Like this recipe'}
        >
          <Heart
            size={15}
            color={liked ? tokens.color.accent : tokens.color.ink}
            fill={liked ? tokens.color.accent : 'transparent'}
          />
          <Text style={[styles.actTxt, liked && styles.actTxtLiked]}>{liked ? 'Liked' : 'Like'}</Text>
        </Pressable>
        <Pressable
          style={[styles.actBtn, skipped && styles.actBtnSkipped]}
          onPress={() => onSkip(recipe)}
          accessibilityRole="button"
          accessibilityState={{ selected: skipped }}
          accessibilityLabel={skipped ? 'Skipped' : 'Skip this recipe'}
        >
          <X size={15} color={tokens.color.ink} />
          <Text style={styles.actTxt}>{skipped ? 'Skipped' : 'Skip'}</Text>
        </Pressable>
        <Pressable
          style={[styles.actBtn, styles.viewBtn]}
          onPress={() => onOpen(recipe)}
          accessibilityRole="button"
          accessibilityLabel="View recipe details"
        >
          <Text style={[styles.actTxt, styles.viewTxt]}>View</Text>
          <ArrowRight size={15} color={tokens.color.onAccent} />
        </Pressable>
      </View>
      {recipe.missedIngredientCount > 0 && recipe.missedIngredientNames.length > 0 && (
        <Pressable
          style={[styles.missingBtn, missingAdded && styles.missingBtnDone]}
          onPress={() => onAddMissing(recipe)}
          disabled={missingAdded}
          accessibilityRole="button"
          accessibilityLabel={
            missingAdded
              ? 'Missing ingredients are on the shopping list'
              : `Add ${recipe.missedIngredientCount} missing ingredients to the shopping list`
          }
        >
          {missingAdded ? (
            <Check size={14} color={tokens.color.accent} />
          ) : (
            <Plus size={14} color={tokens.color.accent} />
          )}
          <Text style={styles.missingBtnTxt}>
            {missingAdded
              ? 'Missing ingredients on the list'
              : `Add ${recipe.missedIngredientCount} missing to list`}
          </Text>
        </Pressable>
      )}
      <Pressable
        style={styles.cookedBtn}
        onPress={() => onCooked(recipe)}
        accessibilityRole="button"
        accessibilityLabel="I cooked this — update pantry"
      >
        <Text style={styles.cookedBtnTxt}>I made this!</Text>
      </Pressable>
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
  headerPad: { paddingHorizontal: tokens.space(6), paddingTop: tokens.space(4), paddingBottom: tokens.space(3) },
  screenTitle: {
    fontFamily: tokens.font.display.bold,
    fontSize: 28,
    color: tokens.color.ink,
    letterSpacing: -0.5,
    marginBottom: tokens.space(1),
  },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: tokens.color.accent,
    marginBottom: tokens.space(3),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  chip: { paddingVertical: tokens.space(2), paddingHorizontal: tokens.space(3), borderRadius: 999, backgroundColor: tokens.color.surfaceAlt },
  chipSelected: { backgroundColor: tokens.color.accent },
  chipText: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  chipTextSelected: { color: tokens.color.onAccent },
  controls: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3), marginTop: tokens.space(3) },
  ctrlBtn: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
  },
  ctrlBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.accent },
  ctrlInner: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(1) },
  ctrlBtnOn: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  ctrlBtnTxtOn: { color: tokens.color.onAccent },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(1),
    paddingVertical: tokens.space(1),
    paddingHorizontal: tokens.space(2),
    backgroundColor: tokens.color.surface,
    borderRadius: 999,
  },
  metaTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.inkMuted },
  metaTxtHealth: { color: tokens.color.success },
  resetTxt: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.inkMuted },
  ingWrap: { marginTop: tokens.space(3) },
  ingHint: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted, marginBottom: tokens.space(2) },
  ingRow: { flexDirection: 'row', gap: tokens.space(2), paddingRight: tokens.space(4) },
  ingChip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  ingChipOut: { backgroundColor: 'transparent', borderWidth: 1, borderColor: tokens.color.line },
  ingChipTxt: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  ingChipTxtOut: { color: tokens.color.inkMuted },
  scroll: { paddingBottom: tokens.space(10) },
  reasonPad: { paddingHorizontal: tokens.space(6), paddingTop: tokens.space(2) },
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
  heroImgWrap: { position: 'relative' },
  heroImg: { width: '100%', height: 190, backgroundColor: tokens.color.line },
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '38%',
    justifyContent: 'flex-end',
    padding: tokens.space(4),
  },
  // Fixed cream: the scrim is always dark, so this must NOT flip with the theme.
  heroTitleOnImg: {
    fontFamily: tokens.font.display.bold,
    fontSize: 20,
    color: '#F6F2E9',
    letterSpacing: -0.3,
    lineHeight: 24,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroPad: { padding: tokens.space(4) },
  heroTitle: { fontFamily: tokens.font.display.bold, fontSize: 21, color: tokens.color.ink, letterSpacing: -0.3, lineHeight: 25 },
  match: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted, marginTop: tokens.space(2) },
  actions: { flexDirection: 'row', gap: tokens.space(2), marginTop: tokens.space(3) },
  actBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: tokens.space(1),
    paddingVertical: tokens.space(3),
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actBtnLiked: { backgroundColor: tokens.color.accentSoft },
  actBtnSkipped: { opacity: 0.6 },
  viewBtn: { backgroundColor: tokens.color.accent },
  actTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.ink },
  actTxtLiked: { color: tokens.color.accent },
  viewTxt: { color: tokens.color.onAccent },
  missingBtn: {
    flexDirection: 'row',
    gap: tokens.space(1),
    justifyContent: 'center',
    marginTop: tokens.space(2),
    paddingVertical: tokens.space(3),
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    alignItems: 'center',
  },
  missingBtnDone: { borderColor: tokens.color.accentSoft, backgroundColor: tokens.color.accentSoft },
  missingBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.accent },
  cookedBtn: {
    marginTop: tokens.space(2),
    paddingVertical: tokens.space(3),
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.accentSoft,
    alignItems: 'center',
  },
  cookedBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.accent },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: tokens.space(2), marginTop: tokens.space(4) },
  dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: tokens.color.line },
  dotActive: { backgroundColor: tokens.color.accent, width: 18 },
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
  resetBtn: {
    marginTop: tokens.space(4),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(6),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
  },
  resetBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.onAccent },
});

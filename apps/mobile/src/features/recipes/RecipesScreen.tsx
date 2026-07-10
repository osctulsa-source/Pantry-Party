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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
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
  ChefHat,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Heart,
  Leaf,
  PackageCheck,
  Plus,
  RefreshCw,
  Repeat,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  buildTasteProfile,
  defaultMealForHour,
  formatUseItUpBadge,
  getExpiryStatus,
  matchCookedItems,
  mealtimeLabel,
  scoreTitle,
  scoreUseItUp,
  seedPrefsFromTaste,
  suggestSubstitutes,
  type MealType,
  type PantryItem,
  type PrefEvent,
  type RecipePrefs,
  type SubstituteSuggestion,
} from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { ScreenHeader } from '../../components/ScreenHeader';
import { CookEmptyArt } from '../../components/illustrations/CookEmptyArt';
import { searchByMeal } from '../../data/spoonacular/client';
import type { SpoonacularRecipe } from '../../data/spoonacular/types';
import { formatExpiryMeta } from '../pantry/expiryFormat';
import { usePantryItems } from '../pantry/usePantryItems';
import { addToShoppingList } from '../shopping/addToShoppingList';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { useRecipePrefs } from './useRecipePrefs';
import { useTasteProfile } from './useTasteProfile';
import { useFavorites } from './useFavorites';
import { useActivity } from '../activity/useActivity';
import { CookErrorArt } from '../../components/illustrations/CookErrorArt';
import { CookedItSheet, type CookedSheetItem } from './CookedItSheet';
import { CookSuccessBurst } from './CookSuccessBurst';
import { CookSkeleton } from './CookSkeleton';
import { CURATED_SOURCE_NAME, searchCurated } from '../../data/curated/curatedSource';
import type { RootStackParamList } from '../../../App';

const CARD_W = Dimensions.get('window').width;
const PAGE = 8;
// Bundled house recipes injected per page alongside the server results.
const CURATED_PAGE = 6;

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

function stepCount(r: SpoonacularRecipe): number {
  return r.instructions.reduce((n, g) => n + g.steps.length, 0);
}

/** Beginner-friendly: quick, few steps, few ingredients. Unknown step data doesn't disqualify. */
function isEasy(r: SpoonacularRecipe): boolean {
  const steps = stepCount(r);
  const ings = r.ingredients.length || r.usedIngredientCount + r.missedIngredientCount;
  const quick = r.readyInMinutes !== null ? r.readyInMinutes <= 40 : true;
  const fewSteps = steps === 0 ? true : steps <= 7;
  return quick && fewSteps && ings > 0 && ings <= 10;
}

/** No shopping needed — you already have everything. */
function isReadyNow(r: SpoonacularRecipe): boolean {
  return r.missedIngredientCount === 0;
}

/** Whether we can show step-by-step instructions for this recipe in-app. */
function hasInstructions(r: SpoonacularRecipe): boolean {
  return stepCount(r) > 0;
}

/** A compact recipe row (thumb + title + meta), shared by the "Because you
 *  saved" suggestions and the "More from your pantry" alternates. */
function RecipeRow({
  recipe,
  useItUp,
  onOpen,
}: {
  recipe: SpoonacularRecipe;
  useItUp: { badge: string | null; expired: boolean } | null;
  onOpen: (r: SpoonacularRecipe) => void;
}) {
  return (
    <Pressable style={styles.altRow} onPress={() => onOpen(recipe)}>
      {recipe.image ? (
        <Image source={{ uri: recipe.image }} style={styles.altThumb} />
      ) : (
        <View style={[styles.altThumb, styles.altThumbPlaceholder]}>
          <ChefHat size={22} color={tokens.color.accent} strokeWidth={1.5} />
        </View>
      )}
      <View style={styles.altText}>
        <Text style={styles.altName} numberOfLines={1}>
          {recipe.title}
        </Text>
        <Text style={styles.altMeta} numberOfLines={1}>
          {recipe.readyInMinutes !== null ? `${recipe.readyInMinutes} min · ` : ''}
          {matchLine(recipe)}
          {recipe.healthScore !== null && recipe.healthScore >= 70 ? ' · very healthy' : ''}
          {recipe.sourceName === CURATED_SOURCE_NAME ? ' · house recipe' : ''}
        </Text>
        {useItUp?.badge && (
          <Text
            style={[
              styles.useItUp,
              {
                color: useItUp.expired
                  ? tokens.semantic.expiry.expired
                  : tokens.semantic.expiry.warning,
              },
            ]}
            numberOfLines={1}
          >
            {useItUp.badge}
          </Text>
        )}
      </View>
      <ChevronRight size={18} color={tokens.color.inkMuted} />
    </Pressable>
  );
}

export function RecipesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
  const [easy, setEasy] = useState(false);
  const [readyNow, setReadyNow] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]); // lowercased names
  const [offset, setOffset] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [recipeState, setRecipeState] = useState<RecipeState>({ kind: 'loading' });
  // Cook confirmation lives HERE (not in CookThis) so it survives the refetch a
  // cook can trigger: finishing an item changes the pantry name-set, which
  // remounts CookThis and would otherwise drop the success burst.
  const [cooked, setCooked] = useState<{ count: number; key: number } | null>(null);
  const [savedToast, setSavedToast] = useState<{ title: string; key: number } | null>(null);

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
    // Bundled house recipes: matched locally against the pantry (zero quota,
    // works offline). Same exclusions + meal filter + paging as the server
    // search; merged below, then re-ranked by the existing blend.
    const curated = searchCurated(
      items
        .filter((i) => !excluded.includes(i.name.toLowerCase()))
        .map((i) => ({ id: i.id, name: i.name, quantity: i.quantity })),
      { type: meal === 'any' ? undefined : meal, number: CURATED_PAGE, offset },
    );
    (async () => {
      try {
        const recipes = await searchByMeal(names, {
          type: meal === 'any' ? undefined : meal,
          number: PAGE,
          offset,
        });
        if (cancelled) return;
        const merged = [...recipes, ...curated];
        setRecipeState(merged.length === 0 ? { kind: 'empty', reason: 'no-match' } : { kind: 'ok', recipes: merged });
      } catch (e) {
        if (cancelled) return;
        // Server down / offline: the bundled recipes still work — degrade the
        // Cook tab to offline mode instead of showing an error.
        if (curated.length > 0) setRecipeState({ kind: 'ok', recipes: curated });
        else setRecipeState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
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

  // Auto-dismiss the "Saved to Your Kitchen" toast.
  useEffect(() => {
    if (!savedToast) return;
    const t = setTimeout(() => setSavedToast(null), 3000);
    return () => clearTimeout(t);
  }, [savedToast]);

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

  const activeFilters = (healthy ? 1 : 0) + (easy ? 1 : 0) + (readyNow ? 1 : 0);
  const canReset = excluded.length > 0 || offset > 0;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Cook"
        subtitle={`Cook this · ${mealtimeLabel(hour)}`}
        right={
          <Pressable
            onPress={() => navigation.navigate('Favorites')}
            hitSlop={8}
            style={styles.kitchenBtn}
            accessibilityRole="button"
            accessibilityLabel="Your Kitchen — saved recipes and your taste"
          >
            <Heart size={14} color={tokens.color.accent} fill={tokens.color.accent} />
            <Text style={styles.kitchenBtnTxt}>Your Kitchen</Text>
          </Pressable>
        }
      />
      <View style={styles.headerPad}>
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
            style={[styles.ctrlBtn, activeFilters > 0 && styles.ctrlBtnOn]}
            onPress={() => setFiltersOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={activeFilters > 0 ? `Filters, ${activeFilters} active` : 'Filters'}
          >
            <View style={styles.ctrlInner}>
              <SlidersHorizontal size={13} color={activeFilters > 0 ? tokens.color.onAccent : tokens.color.accent} />
              <Text style={[styles.ctrlBtnTxt, activeFilters > 0 && styles.ctrlBtnTxtOn]}>
                {activeFilters > 0 ? `Filters · ${activeFilters}` : 'Filters'}
              </Text>
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
            <Text style={styles.ingHint}>Tap to leave one out.</Text>
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
          easy={easy}
          readyNow={readyNow}
          onCookComplete={(n) => setCooked(n > 0 ? { count: n, key: Date.now() } : null)}
          onSaved={(title) => setSavedToast({ title, key: Date.now() })}
        />
      )}

      <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setFiltersOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Filters</Text>
            <FilterRow
              icon={<Leaf size={20} color={tokens.color.accent} />}
              label="Healthy"
              hint="Higher health score"
              on={healthy}
              onToggle={() => setHealthy((v) => !v)}
            />
            <FilterRow
              icon={<Sparkles size={20} color={tokens.color.accent} />}
              label="Easy"
              hint="Quick, few steps"
              on={easy}
              onToggle={() => setEasy((v) => !v)}
            />
            <FilterRow
              icon={<PackageCheck size={20} color={tokens.color.accent} />}
              label="Ready now"
              hint="No shopping needed"
              on={readyNow}
              onToggle={() => setReadyNow((v) => !v)}
            />
            {activeFilters > 0 && (
              <Pressable
                style={styles.sheetClear}
                onPress={() => {
                  setHealthy(false);
                  setEasy(false);
                  setReadyNow(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Clear filters"
              >
                <Text style={styles.sheetClearTxt}>Clear filters</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {savedToast && (
        <View style={styles.toast} accessibilityRole="alert">
          <Heart size={15} color={tokens.color.accent} fill={tokens.color.accent} />
          <Text style={styles.toastTxt} numberOfLines={1}>
            Saved to Your Kitchen
          </Text>
          <Pressable
            onPress={() => {
              setSavedToast(null);
              navigation.navigate('Favorites');
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="View Your Kitchen"
          >
            <Text style={styles.toastView}>View ›</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function FilterRow({
  icon,
  label,
  hint,
  on,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.filterRow, pressed && styles.filterRowPressed]}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <View style={styles.filterIcon}>{icon}</View>
      <View style={styles.filterText}>
        <Text style={styles.filterLabel}>{label}</Text>
        <Text style={styles.filterHint}>{hint}</Text>
      </View>
      <View style={[styles.checkCircle, on && styles.checkCircleOn]}>
        {on && <Check size={14} color={tokens.color.onAccent} />}
      </View>
    </Pressable>
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
  easy,
  readyNow,
  onCookComplete,
  onSaved,
}: {
  recipes: SpoonacularRecipe[];
  items: PantryItem[];
  prefs: RecipePrefs;
  record: (title: string, event: PrefEvent) => void;
  householdId: string | null;
  userId: string | null;
  healthy: boolean;
  easy: boolean;
  readyNow: boolean;
  onCookComplete: (updatedCount: number) => void;
  onSaved: (title: string) => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { favorites, isFavorited, toggleFavorite } = useFavorites();
  const { events: activity } = useActivity();
  // Synced taste signal from what the household saves + cooks — strengthens the
  // ranking AND drives the "Because you saved" row, and survives a reinstall
  // (unlike the on-device prefs map).
  const tasteProfile = useMemo(() => buildTasteProfile(favorites, activity), [favorites, activity]);
  // The flavor-quiz seed (device-local). Cold-start signal so ranking has
  // something to lean on before there are saves/cooks to learn from.
  const { profile: tasteQuiz } = useTasteProfile(householdId);
  const seedPrefs = useMemo(() => seedPrefsFromTaste(tasteQuiz), [tasteQuiz]);
  // Re-anchored whenever the (reactive) pantry changes — a persistent tab can
  // sit mounted across midnight, so a fixed `new Date()` would drift.
  const now = useMemo(() => new Date(), [items]);
  const urgent = pickUrgent(items, now);
  const reason = urgent ? `Because your ${urgent.name.toLowerCase()} ${lowerFirst(formatExpiryMeta(urgent, now))}` : null;
  const reasonColor =
    urgent && getExpiryStatus(urgent, now) === 'expired' ? tokens.semantic.expiry.expired : tokens.semantic.expiry.warning;

  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const [cooking, setCooking] = useState<SpoonacularRecipe | null>(null);
  // Recipes whose missing ingredients were added to the shopping list (feedback).
  const [missingAdded, setMissingAdded] = useState<Set<number>>(new Set());

  // "Use it up": per-recipe expiry urgency. Score joins the ranking blend
  // below; badge explains the boost on the card. Recomputed only when the
  // fetched page or the (reactive) pantry changes.
  const useItUpByRecipe = useMemo(() => {
    const pantry = items.map((i) => ({ name: i.name, expiresAt: i.expiresAt }));
    const map = new Map<number, { score: number; badge: string | null; expired: boolean }>();
    for (const r of recipes) {
      if (r.usedIngredientNames.length === 0) continue;
      const { score, urgentMatches } = scoreUseItUp(r.usedIngredientNames, pantry, now);
      if (score === 0) continue;
      map.set(r.id, {
        score,
        badge: formatUseItUpBadge(urgentMatches),
        expired: urgentMatches[0]?.status === 'expired',
      });
    }
    return map;
  }, [recipes, items, now]);

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
    // Healthy / Ready-now / Easy filters stack, each with a keep-all fallback so
    // a strict filter never leaves an empty screen (badges still tell the
    // story). Pantry-match stays the dominant signal; toggles filter + nudge.
    // All run client-side off the same cached response — zero extra quota.
    let candidates = recipes;
    if (healthy) {
      const fit = recipes.filter((r) => (r.healthScore ?? 0) >= 35);
      if (fit.length > 0) candidates = fit;
    }
    if (readyNow) {
      const fit = candidates.filter(isReadyNow);
      if (fit.length > 0) candidates = fit;
    }
    if (easy) {
      const fit = candidates.filter(isEasy);
      if (fit.length > 0) candidates = fit;
    }
    // Always prefer recipes we can actually show steps for in-app, so the hero
    // + alternates never dead-end on a "view original" card. Same keep-all
    // fallback as the toggles: if a whole page somehow lacks steps we keep them
    // all (the detail screen still backfills by id / falls back gracefully).
    // Post-#143 nearly every result qualifies, so this rarely changes anything.
    const withSteps = candidates.filter(hasInstructions);
    if (withSteps.length > 0) candidates = withSteps;
    const blend = (r: SpoonacularRecipe) =>
      scoreTitle(prefs, r.title) * 1.5 +
      scoreTitle(tasteProfile, r.title) * 2 +
      scoreTitle(seedPrefs, r.title) * 1.5 +
      r.usedIngredientCount +
      (useItUpByRecipe.get(r.id)?.score ?? 0) +
      (healthy ? ((r.healthScore ?? 0) / 100) * 6 : 0) +
      (readyNow && isReadyNow(r) ? 3 : 0) +
      (easy && isEasy(r) ? 3 : 0);
    return [...candidates].sort((a, b) => blend(b) - blend(a));
  }, [recipes, prefs, tasteProfile, seedPrefs, healthy, easy, readyNow, useItUpByRecipe]);

  const top = pool.slice(0, 3);
  // Curated pantry stand-ins for each hero card's missing ingredients ("no
  // sour cream, but your Greek yogurt works"). Hero cards only — the compact
  // alternate rows don't have room for the extra line.
  const swapsByRecipe = useMemo(() => {
    const pantry = items.map((i) => ({ id: i.id, name: i.name }));
    const map = new Map<number, SubstituteSuggestion[]>();
    for (const r of pool.slice(0, 3)) {
      if (r.missedIngredientNames.length === 0) continue;
      const swaps = suggestSubstitutes(r.missedIngredientNames, pantry);
      if (swaps.length > 0) map.set(r.id, swaps);
    }
    return map;
  }, [pool, items]);
  // "Because you saved" — re-rank the rest of the pool by taste-profile match
  // (synced favorites + cooks). Drawn from pool.slice(3) so it never duplicates
  // the hero, and carved OUT of the alternates below so each recipe shows once.
  const suggestions = useMemo(
    () =>
      pool
        .slice(3)
        .map((r) => ({ r, s: scoreTitle(tasteProfile, r.title) }))
        .filter((x) => x.s > 0 && !isFavorited(x.r.id))
        .sort((a, b) => b.s - a.s)
        .slice(0, 3)
        .map((x) => x.r),
    [pool, tasteProfile, isFavorited],
  );
  const suggestionIds = useMemo(() => new Set(suggestions.map((r) => r.id)), [suggestions]);
  const alternates = useMemo(
    () => pool.slice(3).filter((r) => !suggestionIds.has(r.id)),
    [pool, suggestionIds],
  );
  const tasteLabel = favorites[0]
    ? `Because you saved ${favorites[0].title}`
    : 'Because you cook these';
  const first = top[0]; // the pick-one-for-me target (guarded before use)

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

  async function onToggleFavorite(r: SpoonacularRecipe) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const result = await toggleFavorite(r);
    // Saving is also the strongest "I like this" signal for ranking.
    if (result === 'saved') {
      record(r.title, 'like');
      onSaved(r.title);
    }
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
      <Text style={styles.swipeHint}>Swipe to browse — we learn your taste.</Text>

      {first && (
        <Pressable
          style={styles.pickForMe}
          onPress={() => onOpen(first)}
          accessibilityRole="button"
          accessibilityLabel="Not sure — pick a recipe for me"
        >
          <Sparkles size={14} color={tokens.color.accent} />
          <Text style={styles.pickForMeTxt}>Not sure? Pick one for me</Text>
        </Pressable>
      )}

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
            favorited={isFavorited(item.id)}
            skipped={skipped.has(item.id)}
            missingAdded={missingAdded.has(item.id)}
            substitutes={swapsByRecipe.get(item.id) ?? []}
            useItUp={useItUpByRecipe.get(item.id) ?? null}
            onToggleFavorite={(r) => void onToggleFavorite(r)}
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

      {suggestions.length > 0 && (
        <View style={styles.altsPad}>
          <Text style={styles.suggestHead} numberOfLines={1}>
            {tasteLabel}
          </Text>
          {suggestions.map((r) => (
            <RecipeRow key={r.id} recipe={r} useItUp={useItUpByRecipe.get(r.id) ?? null} onOpen={onOpen} />
          ))}
        </View>
      )}

      {alternates.length > 0 && (
        <View style={styles.altsPad}>
          <Text style={styles.altHead}>More from your pantry</Text>
          {alternates.map((r) => (
            <RecipeRow key={r.id} recipe={r} useItUp={useItUpByRecipe.get(r.id) ?? null} onOpen={onOpen} />
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
  favorited,
  skipped,
  missingAdded,
  substitutes,
  useItUp,
  onToggleFavorite,
  onSkip,
  onOpen,
  onCooked,
  onAddMissing,
}: {
  recipe: SpoonacularRecipe;
  favorited: boolean;
  skipped: boolean;
  missingAdded: boolean;
  substitutes: SubstituteSuggestion[];
  useItUp: { badge: string | null; expired: boolean } | null;
  onToggleFavorite: (r: SpoonacularRecipe) => void;
  onSkip: (r: SpoonacularRecipe) => void;
  onOpen: (r: SpoonacularRecipe) => void;
  onCooked: (r: SpoonacularRecipe) => void;
  onAddMissing: (r: SpoonacularRecipe) => void;
}) {
  return (
    <View style={styles.cardPage}>
      <Pressable style={[styles.hero, skipped && styles.heroDim]} onPress={() => onOpen(recipe)}>
        <View style={styles.heroImgWrap}>
          {recipe.image ? (
            <Image source={{ uri: recipe.image }} style={styles.heroImg} />
          ) : (
            <View style={[styles.heroImg, styles.heroImgPlaceholder]}>
              <ChefHat size={44} color={tokens.color.accent} strokeWidth={1.5} />
            </View>
          )}
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
            isEasy(recipe) ||
            isReadyNow(recipe) ||
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
              {isEasy(recipe) && (
                <View style={styles.metaChip}>
                  <Sparkles size={12} color={tokens.color.accent} />
                  <Text style={[styles.metaTxt, styles.metaTxtEasy]}>Easy</Text>
                </View>
              )}
              {isReadyNow(recipe) && (
                <View style={styles.metaChip}>
                  <PackageCheck size={12} color={tokens.color.success} />
                  <Text style={[styles.metaTxt, styles.metaTxtHealth]}>Ready now</Text>
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
              {recipe.sourceName === CURATED_SOURCE_NAME && (
                <View style={[styles.metaChip, styles.houseChip]}>
                  <ChefHat size={12} color={tokens.color.accent} />
                  <Text style={[styles.metaTxt, styles.metaTxtEasy]}>House recipe</Text>
                </View>
              )}
            </View>
          )}
          <Text style={styles.match}>{matchLine(recipe)}</Text>
          {useItUp?.badge && (
            <Text
              style={[
                styles.useItUp,
                {
                  color: useItUp.expired
                    ? tokens.semantic.expiry.expired
                    : tokens.semantic.expiry.warning,
                },
              ]}
              numberOfLines={1}
            >
              {useItUp.badge}
            </Text>
          )}
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          style={[styles.actBtn, favorited && styles.actBtnLiked]}
          onPress={() => onToggleFavorite(recipe)}
          accessibilityRole="button"
          accessibilityState={{ selected: favorited }}
          accessibilityLabel={favorited ? 'Saved to favorites' : 'Save to favorites'}
        >
          <Heart
            size={15}
            color={favorited ? tokens.color.accent : tokens.color.ink}
            fill={favorited ? tokens.color.accent : 'transparent'}
          />
          <Text style={[styles.actTxt, favorited && styles.actTxtLiked]}>{favorited ? 'Saved' : 'Save'}</Text>
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
      {substitutes.length > 0 && (
        <View style={styles.swapHint}>
          <Repeat size={13} color={tokens.color.accent} />
          <Text style={styles.swapHintTxt} numberOfLines={2}>
            {'Swap: '}
            {substitutes
              .map((s) => `${s.pantryItemName} for ${s.missingIngredient.toLowerCase()}`)
              .join(' · ')}
          </Text>
        </View>
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
  headerPad: { paddingHorizontal: tokens.space(6), paddingTop: 0, paddingBottom: tokens.space(3) },
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
  metaTxtEasy: { color: tokens.color.accent },
  useItUp: { fontFamily: tokens.font.body.semibold, fontSize: 12, marginTop: tokens.space(1) },
  houseChip: { backgroundColor: tokens.color.accentSoft },
  heroImgPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.accentSoft },
  altThumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.accentSoft },
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
  pickForMe: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space(1),
    marginHorizontal: tokens.space(6),
    marginBottom: tokens.space(4),
    paddingVertical: tokens.space(3),
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
  },
  pickForMeTxt: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.accent },
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
  swapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(1),
    marginTop: tokens.space(2),
    paddingHorizontal: tokens.space(1),
  },
  swapHintTxt: {
    flex: 1,
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    color: tokens.color.accent,
    lineHeight: 16,
  },
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
  suggestHead: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 15,
    color: tokens.color.ink,
    letterSpacing: -0.2,
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
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(5),
    paddingBottom: tokens.space(10),
  },
  sheetTitle: { fontFamily: tokens.font.display.semibold, fontSize: 18, color: tokens.color.ink, marginBottom: tokens.space(2) },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3), paddingVertical: tokens.space(3) },
  filterRowPressed: { opacity: 0.6 },
  filterIcon: { width: 32, alignItems: 'center' },
  filterText: { flex: 1 },
  filterLabel: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.ink },
  filterHint: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted, marginTop: 1 },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: tokens.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleOn: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  sheetClear: { marginTop: tokens.space(3), paddingVertical: tokens.space(2), alignItems: 'center' },
  sheetClearTxt: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.inkMuted },
  kitchenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(1),
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.accentSoft,
  },
  kitchenBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12.5, color: tokens.color.accent },
  toast: {
    position: 'absolute',
    left: tokens.space(6),
    right: tokens.space(6),
    bottom: tokens.space(4),
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(2),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.ink,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  toastTxt: { flex: 1, fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.surface },
  toastView: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.accentSoft },
});

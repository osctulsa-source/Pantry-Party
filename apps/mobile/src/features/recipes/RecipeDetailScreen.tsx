/**
 * RecipeDetailScreen — the in-app recipe view.
 *
 * Before this, tapping a recipe opened spoonacular.com in the system browser.
 * Now the whole recipe lives in-app: hero image, time/servings/health, an
 * ingredient list split into what you already have vs. what you'll need,
 * numbered step-by-step instructions, and the cooking actions (I made this →
 * pantry decrement, Add missing → shopping list).
 *
 * Zero tap-time fetch: every field rides along on the SAME proxy response the
 * Cook tab already has (the recipe object is passed as a route param), so the
 * screen opens instantly. Fields are empty/null for older cached responses
 * that predate the proxy passthrough (feat/recipe-detail-payload) — the screen
 * degrades gracefully and points to the original source for the full recipe.
 *
 * Spoonacular's terms require crediting the source; the "View original" link
 * (sourceUrl + sourceName) is always offered when present.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronLeft, Clock, ExternalLink, Heart, Leaf, Plus, Repeat, Users, Utensils } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  categorizeByName,
  COOKING_DEVICES,
  detectDevices,
  detectUncoveredStaples,
  suggestSubstitutes,
  titleCaseIngredient,
  type CookingDevice,
} from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { RecipeSavedHeart, SimmeringLoader } from '../../motion';
import { CategoryIcon } from '../pantry/CategoryIcon';
import { useReduceMotion } from '../../components/useReduceMotion';
import { usePantryItems } from '../pantry/usePantryItems';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { addToShoppingList } from '../shopping/addToShoppingList';
import { useRecipePrefs } from './useRecipePrefs';
import { useFavorites } from './useFavorites';
import { CookedItSheet, type CookedSheetItem } from './CookedItSheet';
import { buildCookedSheetItems } from './buildCookedSheetItems';
import { CookSuccessBurst } from './CookSuccessBurst';
import { CookModeView } from './CookModeView';
import { fetchRecipeInstructions } from '../../data/spoonacular/client';
import type { RecipeInstructionGroup } from '../../data/spoonacular/types';
import { resolveRecipeImageSource } from '../../data/curated/resolveRecipeImage';
import { getDeviceVariants, pickDefaultDevice } from '../../data/curated/curatedVariants';
import { useTonightDevices } from './useTonightDevices';
import { formatAmount, scaleIngredients } from './scaleServings';
import type { RootStackParamList } from '../../../App';

const HERO_H = 280;

type Props = NativeStackScreenProps<RootStackParamList, 'RecipeDetail'>;

/** Strip Spoonacular's HTML summary down to plain text. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A clean, capped one-paragraph description — Spoonacular summaries trail off into marketing. */
function shortSummary(html: string): string {
  const text = stripHtml(html);
  if (text.length <= 240) return text;
  const cut = text.slice(0, 240);
  const lastStop = cut.lastIndexOf('. ');
  return lastStop > 120 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

/** Loose name match so an ingredient line can be flagged "you have this". */
function hasIngredient(usedLc: string[], ingredientName: string): boolean {
  const n = ingredientName.toLowerCase();
  if (n.length === 0) return false;
  return usedLc.some((u) => u.length > 0 && (n.includes(u) || u.includes(n)));
}

function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagTxt}>{label}</Text>
    </View>
  );
}

export function RecipeDetailScreen({ route, navigation }: Props) {
  const { recipe } = route.params;
  const insets = useSafeAreaInsets();
  const { items } = usePantryItems();
  const { activeHouseholdId } = useActiveHousehold();
  const { state: authState } = useAuth();
  const userId = authState.status === 'authenticated' ? authState.session.user.id : null;
  const { record } = useRecipePrefs(activeHouseholdId);
  const { isFavorited, toggleFavorite } = useFavorites();
  const favorited = isFavorited(recipe.id);

  // Device variants: full alternate instruction sets for curated recipes.
  // activeDevice null = the original instructions. Auto-defaults to the
  // first of tonight's picked devices that has a variant (a native keyword
  // match wins as Original) — but never after the user touches the switcher;
  // re-fires (household change) may upgrade to a variant but never revert to
  // Original.
  const variants = useMemo(() => getDeviceVariants(recipe.id), [recipe.id]);
  const { devices: tonightDevices, loaded: tonightLoaded } = useTonightDevices(activeHouseholdId);
  const [activeDevice, setActiveDevice] = useState<CookingDevice | null>(null);
  const deviceTouched = useRef(false);

  useEffect(() => {
    if (!tonightLoaded || deviceTouched.current || variants.length === 0) return;
    const native = detectDevices(
      recipe.title,
      recipe.instructions.flatMap((g) => g.steps.flatMap((s) => s.equipment)),
    );
    const def = pickDefaultDevice(tonightDevices, variants, native);
    if (def) {
      setActiveDevice(def);
      // Checked-off steps belong to the previous instruction set.
      setDoneSteps(new Set());
    }
  }, [tonightLoaded, tonightDevices, variants, recipe.title, recipe.instructions]);

  const activeVariant = useMemo(
    () => variants.find((v) => v.device === activeDevice) ?? null,
    [variants, activeDevice],
  );

  // Chip row entries in COOKING_DEVICES display order (lazy appliances first).
  const variantDevices = useMemo(
    () => COOKING_DEVICES.filter((d) => variants.some((v) => v.device === d.id)),
    [variants],
  );

  function selectDevice(device: CookingDevice | null) {
    deviceTouched.current = true;
    Haptics.selectionAsync().catch(() => {});
    setActiveDevice(device);
    // Checked-off steps belong to the previous instruction set.
    setDoneSteps(new Set());
  }

  const scrollRef = useRef<ScrollView>(null);
  const [cooking, setCooking] = useState(false);
  const [cookMode, setCookMode] = useState(false);
  const [cookedCount, setCookedCount] = useState<number | null>(null);
  const [missingAdded, setMissingAdded] = useState(false);
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [savedToast, setSavedToast] = useState<{ key: number } | null>(null);
  const [fetchedSteps, setFetchedSteps] = useState<RecipeInstructionGroup[] | null>(null);
  const [loadingSteps, setLoadingSteps] = useState(false);
  // Screen-only serving count, scoped to this recipe view — resets whenever
  // a different recipe is opened (see the effect below), never persisted.
  const [servings, setServings] = useState(recipe.servings ?? 1);

  useEffect(() => {
    setServings(recipe.servings ?? 1);
  }, [recipe.id, recipe.servings]);

  const MIN_SERVINGS = 1;
  const MAX_SERVINGS = 12;

  function adjustServings(delta: number) {
    const next = servings + delta;
    if (next < MIN_SERVINGS || next > MAX_SERVINGS) return;
    Haptics.selectionAsync().catch(() => {});
    setServings(next);
  }

  // Auto-dismiss the "Saved to Your Kitchen" toast.
  useEffect(() => {
    if (!savedToast) return;
    const t = setTimeout(() => setSavedToast(null), 3000);
    return () => clearTimeout(t);
  }, [savedToast]);

  // Lazy step backfill: a few recipes arrive with empty instructions (an old
  // favorite saved before the proxy passthrough, or a rare straggler). Fetch
  // them by id so the steps list AND Cook Mode still work. Best-effort — the
  // client returns [] on failure, leaving the "view original" fallback.
  useEffect(() => {
    if (recipe.instructions.length > 0) return;
    let cancelled = false;
    setLoadingSteps(true);
    fetchRecipeInstructions(recipe.id).then((groups) => {
      if (cancelled) return;
      setFetchedSteps(groups);
      setLoadingSteps(false);
    });
    return () => {
      cancelled = true;
    };
  }, [recipe.id, recipe.instructions.length]);

  const usedLc = useMemo(
    () => recipe.usedIngredientNames.map((n) => n.toLowerCase()),
    [recipe.usedIngredientNames],
  );

  // Display-only scaling: amounts shown in the ingredient list and (via
  // effectiveRecipe below) Cook Mode's prep list + per-step chips. Pantry
  // matching (hasIngredient) and the shopping-list add stay name-based and
  // are unaffected by this — they never read `amount`.
  const scaledIngredients = useMemo(
    () => scaleIngredients(recipe.ingredients, recipe.servings ?? 1, servings),
    [recipe.ingredients, recipe.servings, servings],
  );

  // "You have X of Y" — the calm way into a long ingredient list. The bar
  // eases up to the level on mount (skipped under OS Reduce Motion).
  const reduceMotion = useReduceMotion();
  const haveCount = useMemo(
    () => scaledIngredients.filter((ing) => hasIngredient(usedLc, ing.name)).length,
    [scaledIngredients, usedLc],
  );
  const haveLevel = scaledIngredients.length > 0 ? haveCount / scaledIngredients.length : 0;
  const haveAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(haveAnim, {
      toValue: haveLevel,
      duration: reduceMotion ? 0 : 700,
      useNativeDriver: false, // animates width — layout property
    }).start();
  }, [haveLevel, reduceMotion, haveAnim]);

  // Curated pantry stand-ins for ingredients the user doesn't have — keyed by
  // the ingredient's lowercase name so the list rows can annotate in place.
  const swapsByIngredient = useMemo(() => {
    const missingNames = scaledIngredients
      .filter((ing) => !hasIngredient(usedLc, ing.name))
      .map((ing) => ing.name);
    const swaps = suggestSubstitutes(
      missingNames,
      items.map((i) => ({ id: i.id, name: i.name })),
    );
    return new Map(swaps.map((s) => [s.missingIngredient.toLowerCase(), s]));
  }, [scaledIngredients, usedLc, items]);

  // Same matching the Cook tab uses — never dump the whole pantry.
  const sheetItems = useMemo<CookedSheetItem[]>(
    () => buildCookedSheetItems(recipe.usedIngredientNames, items),
    [recipe.usedIngredientNames, items],
  );

  async function onAddMissing() {
    if (!activeHouseholdId || !userId || recipe.missedIngredientNames.length === 0) return;
    Haptics.selectionAsync().catch(() => {});
    for (const name of recipe.missedIngredientNames) {
      await addToShoppingList({
        householdId: activeHouseholdId,
        userId,
        name: titleCaseIngredient(name),
        source: 'recipe',
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setMissingAdded(true);
  }

  async function onToggleSave() {
    Haptics.selectionAsync().catch(() => {});
    const result = await toggleFavorite(recipe);
    // Saving is a positive preference signal too (mirrors the Cook tab heart).
    if (result === 'saved') {
      record(recipe.title, 'like');
      setSavedToast({ key: Date.now() });
    }
  }

  function onCookDone(updated: number) {
    // Cooking is the strongest preference signal we collect (mirrors the card).
    record(recipe.title, 'like');
    setCooking(false);
    setCookedCount(updated > 0 ? updated : null);
    // Burst renders at the top of the body — bring it into view.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function toggleStep(key: string) {
    Haptics.selectionAsync().catch(() => {});
    setDoneSteps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // A few recipes arrive with empty instructions (see the backfill effect
  // above); once fetched by id, render from that copy instead of the payload.
  // An active device variant takes precedence over both.
  const effectiveInstructions = useMemo(() => {
    if (activeVariant) return [{ name: '', steps: activeVariant.steps }];
    return recipe.instructions.length > 0 ? recipe.instructions : (fetchedSteps ?? []);
  }, [activeVariant, recipe.instructions, fetchedSteps]);
  // Cook Mode reads recipe.instructions directly, so hand it whichever
  // instruction set is on screen (variant > backfill > payload).
  const effectiveRecipe = useMemo(() => {
    const base =
      recipe.instructions.length === 0 && fetchedSteps
        ? { ...recipe, instructions: fetchedSteps }
        : recipe;
    const withScaledIngredients = { ...base, ingredients: scaledIngredients };
    if (activeVariant) {
      return {
        ...withScaledIngredients,
        instructions: [{ name: '', steps: activeVariant.steps }],
        readyInMinutes: activeVariant.readyInMinutes,
      };
    }
    return withScaledIngredients;
  }, [recipe, fetchedSteps, activeVariant, scaledIngredients]);

  // Flatten the grouped instructions into one ordered list with a stable key +
  // running number, so the timeline draws a continuous rail and the check-off
  // state survives re-renders. Per-step ingredients/equipment/length ride along
  // on the payload (empty/null for older cached responses).
  const stepList = useMemo(() => {
    const out: Array<{
      key: string;
      groupName: string | null;
      num: number;
      step: string;
      ingredients: string[];
      equipment: string[];
      minutes: number | null;
    }> = [];
    let n = 0;
    effectiveInstructions.forEach((group, gi) => {
      group.steps.forEach((s, si) => {
        n += 1;
        out.push({
          key: `${gi}-${si}`,
          groupName: si === 0 && group.name ? group.name : null,
          num: s.number || n,
          step: s.step,
          ingredients: s.ingredients ?? [],
          equipment: s.equipment ?? [],
          minutes: s.lengthMinutes ?? null,
        });
      });
    });
    return out;
  }, [effectiveInstructions]);

  // Staples (rice, pasta, quinoa, couscous) that are used but never mentioned
  // in a single step — the recipe assumes you already know how to cook them.
  // `recipe.ingredients` is stable across device variants; `stepList` already
  // reflects whichever instruction set (variant/backfill/payload) is on screen.
  const uncoveredStaples = useMemo(
    () =>
      detectUncoveredStaples(
        recipe.ingredients.map((i) => i.name),
        stepList.flatMap((s) => [s.step, ...s.ingredients]),
      ),
    [recipe.ingredients, stepList],
  );

  const displayMinutes = activeVariant ? activeVariant.readyInMinutes : recipe.readyInMinutes;
  const summary = recipe.summary ? shortSummary(recipe.summary) : '';
  const hasSteps = effectiveInstructions.some((g) => g.steps.length > 0);
  const showHealth = recipe.healthScore !== null && recipe.healthScore >= 55;
  const imageSource = resolveRecipeImageSource(recipe);

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + tokens.space(10) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          {imageSource ? (
            <Image source={imageSource} style={styles.hero} />
          ) : (
            <View style={[styles.hero, styles.heroFallback]} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)'] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.heroScrim}
          >
            {recipe.sourceName ? <Text style={styles.heroSourceOnImg}>from {recipe.sourceName}</Text> : null}
            <Text style={styles.heroTitleOnImg} numberOfLines={3}>
              {recipe.title}
            </Text>
          </LinearGradient>
        </View>

        <View style={styles.body}>
          {cookedCount !== null && <CookSuccessBurst itemCount={cookedCount} />}

          {(displayMinutes !== null || recipe.servings !== null || showHealth) && (
            <View style={styles.metaRow}>
              {displayMinutes !== null && (
                <View style={styles.metaChip}>
                  <Clock size={13} color={tokens.color.inkMuted} />
                  <Text style={styles.metaTxt}>{displayMinutes} min</Text>
                </View>
              )}
              {recipe.servings !== null && (
                <View style={styles.servingsStepper}>
                  <Users size={13} color={tokens.color.inkMuted} />
                  <Pressable
                    style={[styles.stepperBtn, servings <= MIN_SERVINGS && styles.stepperBtnDisabled]}
                    onPress={() => adjustServings(-1)}
                    disabled={servings <= MIN_SERVINGS}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease servings"
                  >
                    <Text style={styles.stepperBtnTxt}>−</Text>
                  </Pressable>
                  <Text style={styles.metaTxt} accessibilityLabel={`Serves ${servings}`}>
                    Serves {servings}
                  </Text>
                  <Pressable
                    style={[styles.stepperBtn, servings >= MAX_SERVINGS && styles.stepperBtnDisabled]}
                    onPress={() => adjustServings(1)}
                    disabled={servings >= MAX_SERVINGS}
                    accessibilityRole="button"
                    accessibilityLabel="Increase servings"
                  >
                    <Text style={styles.stepperBtnTxt}>+</Text>
                  </Pressable>
                </View>
              )}
              {showHealth && (
                <View style={styles.metaChip}>
                  <Leaf size={13} color={tokens.color.success} />
                  <Text style={[styles.metaTxt, { color: tokens.color.success }]}>
                    {(recipe.healthScore ?? 0) >= 70 ? 'Very healthy' : 'Healthy'} · {recipe.healthScore}
                  </Text>
                </View>
              )}
            </View>
          )}

          {(recipe.vegan || recipe.vegetarian || recipe.glutenFree) && (
            <View style={styles.tagRow}>
              {recipe.vegan ? <Tag label="Vegan" /> : recipe.vegetarian ? <Tag label="Vegetarian" /> : null}
              {recipe.glutenFree ? <Tag label="Gluten-free" /> : null}
            </View>
          )}

          {summary ? <Text style={styles.summary}>{summary}</Text> : null}

          <Text style={styles.sectionHead}>Ingredients</Text>
          {scaledIngredients.length > 0 ? (
            <>
              {/* At-a-glance: how much of this you can already make. */}
              <View style={styles.ingSummary}>
                <Text style={styles.ingSummaryTxt}>
                  You have <Text style={styles.ingSummaryStrong}>{haveCount}</Text> of{' '}
                  <Text style={styles.ingSummaryStrong}>{scaledIngredients.length}</Text>
                </Text>
                <View style={styles.ingBarTrack}>
                  <Animated.View
                    style={[
                      styles.ingBarFill,
                      {
                        width: haveAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.ingList}>
                {scaledIngredients.map((ing, idx) => {
                  const have = hasIngredient(usedLc, ing.name);
                  const swap = have ? undefined : swapsByIngredient.get(ing.name.toLowerCase());
                  const amount = formatAmount(ing.amount, ing.unit);
                  return (
                    <View key={`${ing.name}-${idx}`} style={styles.ingRow}>
                      {/* Food icon: a visual anchor so the row reads as a FOOD
                          first, not a fraction. Filled when you have it. */}
                      <View style={[styles.ingIcon, have ? styles.ingIconHave : styles.ingIconNeed]}>
                        <CategoryIcon
                          category={categorizeByName(ing.name)}
                          size={16}
                          color={have ? tokens.color.accent : tokens.color.inkMuted}
                        />
                      </View>
                      <View style={styles.ingBody}>
                        <View style={styles.ingNameRow}>
                          <Text style={styles.ingName} numberOfLines={1}>
                            {titleCaseIngredient(ing.name)}
                          </Text>
                          {have && <Check size={13} color={tokens.color.accent} />}
                        </View>
                        {/* The full original line stays — it's the crucial detail. */}
                        <Text style={styles.ingDetail}>{ing.original || ing.name}</Text>
                        {swap && (
                          <View style={styles.swapRow}>
                            <Repeat size={11} color={tokens.color.accent} />
                            <Text style={styles.swapTxt}>Swap in your {swap.pantryItemName}</Text>
                          </View>
                        )}
                      </View>
                      {amount && (
                        <View style={styles.ingAmount}>
                          <Text style={styles.ingAmountTxt}>{amount}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={styles.muted}>Ingredient details aren&apos;t available for this recipe.</Text>
          )}

          {recipe.missedIngredientCount > 0 && recipe.missedIngredientNames.length > 0 && (
            <Pressable
              style={[styles.secondaryBtn, missingAdded && styles.secondaryBtnDone]}
              onPress={() => void onAddMissing()}
              disabled={missingAdded}
              accessibilityRole="button"
              accessibilityLabel={
                missingAdded
                  ? 'Missing ingredients are on the shopping list'
                  : `Add ${recipe.missedIngredientCount} missing ingredients to the shopping list`
              }
            >
              <Plus size={15} color={tokens.color.accent} />
              <Text style={styles.secondaryBtnTxt}>
                {missingAdded
                  ? 'Missing ingredients on the list'
                  : `Add ${recipe.missedIngredientCount} missing to list`}
              </Text>
            </Pressable>
          )}

          {uncoveredStaples.length > 0 && (
            <View style={styles.stapleCard}>
              <View style={styles.stapleHead}>
                <Utensils size={16} color={tokens.color.accent} />
                <Text style={styles.stapleHeadTxt}>
                  {uncoveredStaples.length === 1
                    ? `Heads up — this recipe doesn't say how to cook the ${uncoveredStaples[0]?.label.toLowerCase()}:`
                    : "Heads up — this recipe doesn't say how to cook a couple of staples:"}
                </Text>
              </View>
              {uncoveredStaples.map((s) => (
                <View key={s.id} style={styles.stapleItem}>
                  {uncoveredStaples.length > 1 && <Text style={styles.stapleLabel}>{s.label}</Text>}
                  <Text style={styles.stapleText}>{s.instructions}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionHead}>Steps</Text>
          {variantDevices.length > 0 && (
            <View style={styles.deviceRow}>
              <Pressable
                style={[styles.deviceChip, activeDevice === null && styles.deviceChipActive]}
                onPress={() => selectDevice(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: activeDevice === null }}
                accessibilityLabel="Show the original instructions"
              >
                <Text style={[styles.deviceChipTxt, activeDevice === null && styles.deviceChipTxtActive]}>
                  Original
                </Text>
              </Pressable>
              {variantDevices.map((d) => {
                const active = activeDevice === d.id;
                return (
                  <Pressable
                    key={d.id}
                    style={[styles.deviceChip, active && styles.deviceChipActive]}
                    onPress={() => selectDevice(d.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Show the ${d.label} instructions`}
                  >
                    <Text style={[styles.deviceChipTxt, active && styles.deviceChipTxtActive]}>
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {hasSteps ? (
            stepList.map((item, idx) => {
              const done = doneSteps.has(item.key);
              // Indexed access is `T | undefined` under noUncheckedIndexedAccess —
              // guard before reading the next step's group.
              const next = stepList[idx + 1];
              const showLine = next !== undefined && next.groupName === null;
              const hasMeta =
                item.minutes !== null || item.ingredients.length > 0 || item.equipment.length > 0;
              return (
                <View key={item.key}>
                  {item.groupName ? <Text style={styles.stepGroupLabel}>{item.groupName}</Text> : null}
                  <Pressable
                    style={styles.stepRow}
                    onPress={() => toggleStep(item.key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={`Step ${item.num}${done ? ', done' : ''}: ${item.step}`}
                  >
                    <View style={styles.stepRail}>
                      <View style={[styles.stepNode, done && styles.stepNodeDone]}>
                        {done ? (
                          <Check size={14} color={tokens.color.onAccent} />
                        ) : (
                          <Text style={styles.stepNodeNum}>{item.num}</Text>
                        )}
                      </View>
                      {showLine && <View style={styles.stepLine} />}
                    </View>
                    <View style={styles.stepBody}>
                      <Text style={[styles.stepTxt, done && styles.stepTxtDone]}>{item.step}</Text>
                      {hasMeta && (
                        <View style={styles.chipRow}>
                          {item.minutes !== null && (
                            <View style={[styles.chip, styles.chipTime]}>
                              <Clock size={11} color={tokens.color.accent} />
                              <Text style={styles.chipTimeTxt}>{item.minutes} min</Text>
                            </View>
                          )}
                          {item.ingredients.map((ing, ci) => (
                            <View key={`i-${ci}-${ing}`} style={styles.chip}>
                              <Text style={styles.chipTxt}>{ing}</Text>
                            </View>
                          ))}
                          {item.equipment.map((eq, ci) => (
                            <View key={`e-${ci}-${eq}`} style={[styles.chip, styles.chipEquip]}>
                              <Utensils size={10} color={tokens.color.inkMuted} />
                              <Text style={styles.chipTxt}>{eq}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </Pressable>
                </View>
              );
            })
          ) : loadingSteps ? (
            <View style={styles.stepsLoading}>
              <SimmeringLoader label="Finding the steps…" size={56} />
            </View>
          ) : (
            <Text style={styles.muted}>
              Step-by-step instructions aren&apos;t available for this one — tap below to view the original.
            </Text>
          )}

          {hasSteps && (
            <Pressable
              style={styles.cookBtn}
              onPress={() => setCookMode(true)}
              accessibilityRole="button"
              accessibilityLabel="Start step-by-step cooking"
            >
              <Text style={styles.cookBtnTxt}>Start cooking</Text>
            </Pressable>
          )}
          <Pressable
            style={hasSteps ? styles.madeBtn : styles.cookBtn}
            onPress={() => setCooking(true)}
            accessibilityRole="button"
            accessibilityLabel="I made this — update pantry"
          >
            <Text style={hasSteps ? styles.madeBtnTxt : styles.cookBtnTxt}>I made this!</Text>
          </Pressable>

          {recipe.sourceUrl ? (
            <Pressable
              style={styles.sourceLink}
              onPress={() => void Linking.openURL(recipe.sourceUrl)}
              accessibilityRole="link"
              accessibilityLabel={`View the original recipe${recipe.sourceName ? ` on ${recipe.sourceName}` : ''}`}
            >
              <Text style={styles.sourceLinkTxt}>
                View original{recipe.sourceName ? ` on ${recipe.sourceName}` : ''}
              </Text>
              <ExternalLink size={14} color={tokens.color.accent} />
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <Pressable
        style={[styles.backBtn, { top: insets.top + tokens.space(2) }]}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
      >
        <ChevronLeft size={24} color={tokens.color.ink} />
      </Pressable>

      <View style={[styles.saveBtn, { top: insets.top + tokens.space(2) }]}>
        <RecipeSavedHeart saved={favorited} onToggle={() => void onToggleSave()} size={28} />
      </View>

      {cooking && (
        <CookedItSheet
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          items={sheetItems}
          pantryItems={items}
          householdId={activeHouseholdId}
          onClose={() => setCooking(false)}
          onDone={onCookDone}
        />
      )}

      {cookMode && (
        <CookModeView
          recipe={effectiveRecipe}
          onClose={() => setCookMode(false)}
          onFinish={() => {
            setCookMode(false);
            setCooking(true);
          }}
        />
      )}

      {savedToast && (
        <View style={[styles.toast, { bottom: insets.bottom + tokens.space(4) }]} accessibilityRole="alert">
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  scroll: { paddingBottom: tokens.space(10) },
  heroWrap: { position: 'relative' },
  hero: { width: '100%', height: HERO_H, backgroundColor: tokens.color.surfaceAlt },
  heroFallback: { backgroundColor: tokens.color.surfaceAlt },
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '40%',
    justifyContent: 'flex-end',
    paddingHorizontal: tokens.space(6),
    paddingBottom: tokens.space(5),
  },
  // Fixed cream: the scrim is always dark, so these must NOT flip with the theme.
  heroSourceOnImg: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(246,242,233,0.85)',
    marginBottom: tokens.space(1),
  },
  heroTitleOnImg: {
    fontFamily: tokens.font.display.bold,
    fontSize: 26,
    color: '#F6F2E9',
    letterSpacing: -0.4,
    lineHeight: 31,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  backBtn: {
    position: 'absolute',
    left: tokens.space(4),
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  saveBtn: {
    position: 'absolute',
    right: tokens.space(4),
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  body: { paddingHorizontal: tokens.space(6), paddingTop: tokens.space(5) },
  source: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 26,
    color: tokens.color.ink,
    letterSpacing: -0.4,
    lineHeight: 31,
    marginBottom: tokens.space(3),
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2), marginBottom: tokens.space(3) },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(1),
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
  servingsStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(2),
    paddingVertical: tokens.space(1),
    paddingHorizontal: tokens.space(2),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
  stepperBtn: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface,
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },
  stepperBtnTxt: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 15,
    lineHeight: 15,
    color: tokens.color.accent,
  },
  metaTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12.5, color: tokens.color.inkMuted },
  tagRow: { flexDirection: 'row', gap: tokens.space(2), marginBottom: tokens.space(3) },
  tag: {
    paddingVertical: tokens.space(1),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.color.line,
  },
  tagTxt: { fontFamily: tokens.font.body.medium, fontSize: 12, color: tokens.color.secondary },
  summary: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(5),
  },
  sectionHead: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 18,
    color: tokens.color.ink,
    marginTop: tokens.space(2),
    marginBottom: tokens.space(3),
  },
  ingSummary: { marginBottom: tokens.space(3) },
  ingSummaryTxt: { fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.inkMuted, marginBottom: tokens.space(2) },
  ingSummaryStrong: { fontFamily: tokens.font.body.semibold, color: tokens.color.accent },
  ingBarTrack: { height: 6, borderRadius: 999, backgroundColor: tokens.color.surfaceAlt, overflow: 'hidden' },
  ingBarFill: { height: 6, borderRadius: 999, backgroundColor: tokens.color.accent },
  ingList: { gap: tokens.space(1) },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3), paddingVertical: tokens.space(2) },
  ingIcon: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ingIconHave: { backgroundColor: tokens.color.accentSoft },
  ingIconNeed: { borderWidth: 1.5, borderColor: tokens.color.line, backgroundColor: 'transparent' },
  ingBody: { flex: 1 },
  ingNameRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(1) },
  ingName: { flexShrink: 1, fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.ink, lineHeight: 20 },
  ingDetail: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted, lineHeight: 17, marginTop: 1 },
  ingAmount: {
    paddingVertical: 2,
    paddingHorizontal: tokens.space(2),
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surfaceAlt,
  },
  ingAmountTxt: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    color: tokens.color.inkMuted,
    fontVariant: ['tabular-nums'],
  },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(1), marginTop: 2 },
  swapTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.accent },
  muted: { fontFamily: tokens.font.body.regular, fontSize: 14, color: tokens.color.inkMuted, lineHeight: 20 },
  stepsLoading: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2), paddingVertical: tokens.space(2) },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space(1),
    marginTop: tokens.space(4),
    paddingVertical: tokens.space(3),
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
  },
  secondaryBtnDone: { borderColor: tokens.color.accentSoft, backgroundColor: tokens.color.accentSoft },
  secondaryBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.accent },
  stapleCard: {
    marginTop: tokens.space(4),
    padding: tokens.space(4),
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surfaceAlt,
    borderWidth: 1,
    borderColor: tokens.color.line,
    gap: tokens.space(3),
  },
  stapleHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2) },
  stapleHeadTxt: { flex: 1, fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.ink, lineHeight: 18 },
  stapleItem: { gap: 2 },
  stapleLabel: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.accent },
  stapleText: { fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.inkMuted, lineHeight: 18 },
  deviceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space(2),
    marginBottom: tokens.space(3),
  },
  deviceChip: {
    paddingHorizontal: tokens.space(3),
    paddingVertical: tokens.space(2),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surfaceAlt,
  },
  deviceChipActive: {
    borderColor: tokens.color.accent,
    backgroundColor: tokens.color.accentSoft,
  },
  deviceChipTxt: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.inkMuted,
  },
  deviceChipTxtActive: {
    fontFamily: tokens.font.body.semibold,
    color: tokens.color.accent,
  },
  stepGroupLabel: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.accent,
    marginTop: tokens.space(2),
    marginBottom: tokens.space(3),
  },
  stepRow: { flexDirection: 'row', gap: tokens.space(3) },
  stepRail: { width: 28, alignItems: 'center' },
  stepNode: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: tokens.color.accent,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNodeDone: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  stepNodeNum: { fontFamily: tokens.font.display.bold, fontSize: 13, color: tokens.color.accent },
  stepLine: { flex: 1, width: 2, backgroundColor: tokens.color.line, marginVertical: 2 },
  stepBody: { flex: 1, paddingBottom: tokens.space(5) },
  stepTxt: { flex: 1, fontFamily: tokens.font.body.regular, fontSize: 15, color: tokens.color.ink, lineHeight: 22 },
  stepTxtDone: { color: tokens.color.inkMuted, textDecorationLine: 'line-through' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(1), marginTop: tokens.space(2) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: tokens.space(2),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  chipTxt: { fontFamily: tokens.font.body.medium, fontSize: 11, color: tokens.color.inkMuted },
  chipTime: { backgroundColor: tokens.color.accentSoft },
  chipTimeTxt: { fontFamily: tokens.font.body.semibold, fontSize: 11, color: tokens.color.accent },
  chipEquip: { backgroundColor: 'transparent', borderWidth: 1, borderColor: tokens.color.line },
  cookBtn: {
    marginTop: tokens.space(6),
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  cookBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.onAccent },
  madeBtn: {
    marginTop: tokens.space(3),
    paddingVertical: tokens.space(4),
    borderRadius: tokens.radius.md,
    borderWidth: 1.5,
    borderColor: tokens.color.accent,
    alignItems: 'center',
  },
  madeBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.accent },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space(1),
    marginTop: tokens.space(4),
  },
  sourceLinkTxt: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.accent },
  toast: {
    position: 'absolute',
    left: tokens.space(6),
    right: tokens.space(6),
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

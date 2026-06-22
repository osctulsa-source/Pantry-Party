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
import { useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronLeft, Clock, ExternalLink, Heart, Leaf, Plus, Users } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { matchCookedItems } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { usePantryItems } from '../pantry/usePantryItems';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { addToShoppingList } from '../shopping/addToShoppingList';
import { useRecipePrefs } from './useRecipePrefs';
import { useFavorites } from './useFavorites';
import { CookedItSheet, type CookedSheetItem } from './CookedItSheet';
import { CookSuccessBurst } from './CookSuccessBurst';
import { CookModeView } from './CookModeView';
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

  const scrollRef = useRef<ScrollView>(null);
  const [cooking, setCooking] = useState(false);
  const [cookMode, setCookMode] = useState(false);
  const [cookedCount, setCookedCount] = useState<number | null>(null);
  const [missingAdded, setMissingAdded] = useState(false);

  const usedLc = useMemo(
    () => recipe.usedIngredientNames.map((n) => n.toLowerCase()),
    [recipe.usedIngredientNames],
  );

  // Same matching the Cook tab uses: matched pantry items pre-selected; if the
  // API gave us no names, fall back to the whole pantry defaulting to "Kept".
  const sheetItems = useMemo<CookedSheetItem[]>(() => {
    const matches = matchCookedItems(
      recipe.usedIngredientNames,
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
  }, [recipe.usedIngredientNames, items]);

  async function onAddMissing() {
    if (!activeHouseholdId || !userId || recipe.missedIngredientNames.length === 0) return;
    Haptics.selectionAsync().catch(() => {});
    for (const name of recipe.missedIngredientNames) {
      await addToShoppingList({ householdId: activeHouseholdId, userId, name, source: 'recipe' });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setMissingAdded(true);
  }

  async function onToggleSave() {
    Haptics.selectionAsync().catch(() => {});
    const result = await toggleFavorite(recipe);
    // Saving is a positive preference signal too (mirrors the Cook tab heart).
    if (result === 'saved') record(recipe.title, 'like');
  }

  function onCookDone(updated: number) {
    // Cooking is the strongest preference signal we collect (mirrors the card).
    record(recipe.title, 'like');
    setCooking(false);
    setCookedCount(updated > 0 ? updated : null);
    // Burst renders at the top of the body — bring it into view.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  const summary = recipe.summary ? shortSummary(recipe.summary) : '';
  const hasSteps = recipe.instructions.some((g) => g.steps.length > 0);
  const showHealth = recipe.healthScore !== null && recipe.healthScore >= 55;

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + tokens.space(10) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          {recipe.image ? (
            <Image source={{ uri: recipe.image }} style={styles.hero} />
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

          {(recipe.readyInMinutes !== null || recipe.servings !== null || showHealth) && (
            <View style={styles.metaRow}>
              {recipe.readyInMinutes !== null && (
                <View style={styles.metaChip}>
                  <Clock size={13} color={tokens.color.inkMuted} />
                  <Text style={styles.metaTxt}>{recipe.readyInMinutes} min</Text>
                </View>
              )}
              {recipe.servings !== null && (
                <View style={styles.metaChip}>
                  <Users size={13} color={tokens.color.inkMuted} />
                  <Text style={styles.metaTxt}>Serves {recipe.servings}</Text>
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
          {recipe.ingredients.length > 0 ? (
            <View style={styles.ingList}>
              {recipe.ingredients.map((ing, idx) => {
                const have = hasIngredient(usedLc, ing.name);
                return (
                  <View key={`${ing.name}-${idx}`} style={styles.ingRow}>
                    <View style={[styles.ingDot, have ? styles.ingDotHave : styles.ingDotNeed]}>
                      {have ? <Check size={12} color={tokens.color.onAccent} /> : null}
                    </View>
                    <Text style={styles.ingTxt}>{ing.original || ing.name}</Text>
                  </View>
                );
              })}
            </View>
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

          <Text style={styles.sectionHead}>Steps</Text>
          {hasSteps ? (
            recipe.instructions.map((group, gi) => (
              <View key={`g-${gi}`} style={styles.stepGroup}>
                {group.name ? <Text style={styles.stepGroupName}>{group.name}</Text> : null}
                {group.steps.map((s, si) => (
                  <View key={`s-${gi}-${si}`} style={styles.stepRow}>
                    <Text style={styles.stepNum}>{s.number || si + 1}</Text>
                    <Text style={styles.stepTxt}>{s.step}</Text>
                  </View>
                ))}
              </View>
            ))
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

      <Pressable
        style={[styles.saveBtn, { top: insets.top + tokens.space(2) }]}
        onPress={() => void onToggleSave()}
        accessibilityRole="button"
        accessibilityState={{ selected: favorited }}
        accessibilityLabel={favorited ? 'Saved to favorites' : 'Save to favorites'}
        hitSlop={8}
      >
        <Heart
          size={22}
          color={favorited ? tokens.color.accent : tokens.color.ink}
          fill={favorited ? tokens.color.accent : 'transparent'}
        />
      </Pressable>

      {cooking && (
        <CookedItSheet
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          items={sheetItems}
          householdId={activeHouseholdId}
          onClose={() => setCooking(false)}
          onDone={onCookDone}
        />
      )}

      {cookMode && (
        <CookModeView
          recipe={recipe}
          onClose={() => setCookMode(false)}
          onFinish={() => {
            setCookMode(false);
            setCooking(true);
          }}
        />
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
  ingList: { gap: tokens.space(1) },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3), paddingVertical: tokens.space(2) },
  ingDot: { width: 20, height: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ingDotHave: { backgroundColor: tokens.color.accent },
  ingDotNeed: { borderWidth: 1.5, borderColor: tokens.color.line, backgroundColor: 'transparent' },
  ingTxt: { flex: 1, fontFamily: tokens.font.body.regular, fontSize: 15, color: tokens.color.ink, lineHeight: 20 },
  muted: { fontFamily: tokens.font.body.regular, fontSize: 14, color: tokens.color.inkMuted, lineHeight: 20 },
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
  stepGroup: { marginBottom: tokens.space(3) },
  stepGroupName: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 14,
    color: tokens.color.ink,
    marginBottom: tokens.space(2),
  },
  stepRow: { flexDirection: 'row', gap: tokens.space(3), marginBottom: tokens.space(3) },
  stepNum: { fontFamily: tokens.font.display.bold, fontSize: 15, color: tokens.color.accent, width: 22 },
  stepTxt: { flex: 1, fontFamily: tokens.font.body.regular, fontSize: 15, color: tokens.color.ink, lineHeight: 22 },
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
});

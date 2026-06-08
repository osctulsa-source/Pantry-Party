/**
 * RecipesScreen — the "Cook This" surface (Killer 3, first hi-fi pass).
 *
 * Replaces the walking-skeleton plain list. Pulls the pantry from PowerSync,
 * asks Spoonacular what we can cook, and presents a hero recipe + alternates in
 * the Crumb palette. The differentiator is the reason line: it ties the hero to
 * the soonest-expiring pantry item ("because your spinach expires tomorrow") —
 * expiration intelligence as the recommendation surface, not just an alert.
 *
 * Deferred to the full Killer 3 engine: expiration-weighted ranking (we still
 * use Spoonacular's "maximize used ingredients" order) and a native recipe
 * detail screen (taps open the recipe on spoonacular.com via Linking).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../../theme/tokens';
import { powerSyncPantry } from '../../data/powerSyncPantry';
import { findByIngredients } from '../../data/spoonacular/client';
import type { SpoonacularRecipe } from '../../data/spoonacular/types';
import { getExpiryStatus, type PantryItem } from '@breadbox/core';
import { formatExpiryMeta } from '../pantry/expiryFormat';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; recipes: SpoonacularRecipe[]; items: PantryItem[] }
  | { kind: 'empty'; itemCount: number }
  | { kind: 'error'; message: string };

function recipeUrl(r: SpoonacularRecipe): string {
  const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `https://spoonacular.com/recipes/${slug}-${r.id}`;
}

// Soonest-expiring item that actually needs attention (warning/expired) — drives the reason line.
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
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await powerSyncPantry.list();
        if (items.length === 0) {
          if (!cancelled) setState({ kind: 'empty', itemCount: 0 });
          return;
        }
        const recipes = await findByIngredients(items.map((i) => i.name), { number: 6 });
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
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
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
          <Text style={styles.errorTitle}>
            {state.itemCount === 0 ? 'Nothing to cook yet' : 'No matches found'}
          </Text>
          <Text style={styles.helper}>
            {state.itemCount === 0
              ? "Add a few items to your pantry and we'll suggest recipes from what you have."
              : `Your pantry has ${state.itemCount} items — try adding a few more staples.`}
          </Text>
        </View>
      )}

      {state.kind === 'ok' && <CookThis recipes={state.recipes} items={state.items} />}
    </SafeAreaView>
  );
}

function CookThis({ recipes, items }: { recipes: SpoonacularRecipe[]; items: PantryItem[] }) {
  const now = new Date();
  const urgent = pickUrgent(items, now);
  const hero = recipes[0];
  const alternates = recipes.slice(1);

  const reason = urgent ? `Because your ${urgent.name.toLowerCase()} ${lowerFirst(formatExpiryMeta(urgent, now))}` : null;
  const reasonColor =
    urgent && getExpiryStatus(urgent, now) === 'expired'
      ? tokens.semantic.expiry.expired
      : tokens.semantic.expiry.warning;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>Cook this · tonight</Text>

      <Pressable style={styles.hero} onPress={() => Linking.openURL(recipeUrl(hero))}>
        <Image source={{ uri: hero.image }} style={styles.heroImg} />
        <View style={styles.heroPad}>
          <Text style={styles.heroTitle}>{hero.title}</Text>
          {reason && <Text style={[styles.reason, { color: reasonColor }]}>{reason}</Text>}
          <Text style={styles.match}>{matchLine(hero)}</Text>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>View recipe →</Text>
          </View>
        </View>
      </Pressable>

      {alternates.length > 0 && (
        <View style={styles.alts}>
          <Text style={styles.altHead}>More from your pantry</Text>
          {alternates.map((r) => (
            <Pressable key={r.id} style={styles.altRow} onPress={() => Linking.openURL(recipeUrl(r))}>
              <Image source={{ uri: r.image }} style={styles.altThumb} />
              <View style={styles.altText}>
                <Text style={styles.altName}>{r.title}</Text>
                <Text style={styles.altMeta}>{matchLine(r)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
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
  scroll: { padding: tokens.space(6), paddingBottom: tokens.space(10) },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: tokens.color.accent,
    marginBottom: tokens.space(3),
  },
  hero: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.line,
  },
  heroImg: { width: '100%', height: 170, backgroundColor: tokens.color.line },
  heroPad: { padding: tokens.space(4) },
  heroTitle: {
    fontFamily: tokens.font.display.bold,
    fontSize: 22,
    color: tokens.color.ink,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  reason: { fontFamily: tokens.font.body.semibold, fontSize: 13, marginTop: tokens.space(2), lineHeight: 18 },
  match: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted, marginTop: tokens.space(2) },
  cta: {
    marginTop: tokens.space(4),
    height: 46,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.onAccent },
  alts: { marginTop: tokens.space(7) },
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

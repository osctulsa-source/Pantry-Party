/**
 * RecipesScreen — walking skeleton scope.
 *
 * Pulls the current pantry from PowerSync, asks Spoonacular what we can cook,
 * renders 1-5 recipe matches as plain rows. No taps, no detail, no caching.
 * The full Killer 3 Cook This Surface (expiration ranking, daily pick, reason
 * lines) replaces this screen in a future commit.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../../theme/tokens';
import { powerSyncPantry } from '../../data/powerSyncPantry';
import { findByIngredients } from '../../data/spoonacular/client';
import type { SpoonacularRecipe } from '../../data/spoonacular/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; recipes: SpoonacularRecipe[]; pantryNames: string[] }
  | { kind: 'empty'; pantryNames: string[] }
  | { kind: 'error'; message: string };

export function RecipesScreen() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const items = await powerSyncPantry.list();
        const pantryNames = items.map((i) => i.name);

        if (pantryNames.length === 0) {
          if (!cancelled) setState({ kind: 'empty', pantryNames });
          return;
        }

        const recipes = await findByIngredients(pantryNames, { number: 5 });
        if (cancelled) return;

        if (recipes.length === 0) {
          setState({ kind: 'empty', pantryNames });
        } else {
          setState({ kind: 'ok', recipes, pantryNames });
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setState({ kind: 'error', message: msg });
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      {state.kind === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.accent} />
          <Text style={styles.helperText}>Asking Spoonacular what you can cook…</Text>
        </View>
      )}

      {state.kind === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn't load recipes</Text>
          <Text style={styles.helperText}>{state.message}</Text>
        </View>
      )}

      {state.kind === 'empty' && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>No recipes found</Text>
          <Text style={styles.helperText}>
            Your pantry has {state.pantryNames.length} {state.pantryNames.length === 1 ? 'item' : 'items'}.
            Try adding a few more so Spoonacular has more to work with.
          </Text>
        </View>
      )}

      {state.kind === 'ok' && (
        <FlatList
          data={state.recipes}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.contextText}>
              Based on {state.pantryNames.length} {state.pantryNames.length === 1 ? 'item' : 'items'} in your pantry
            </Text>
          }
          renderItem={({ item }) => <RecipeRow recipe={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function RecipeRow({ recipe }: { recipe: SpoonacularRecipe }) {
  return (
    <View style={styles.row}>
      <Image source={{ uri: recipe.image }} style={styles.image} />
      <View style={styles.rowText}>
        <Text style={styles.title}>{recipe.title}</Text>
        <Text style={styles.meta}>
          Uses {recipe.usedIngredientCount} of {recipe.usedIngredientCount + recipe.missedIngredientCount} ingredients
          {recipe.missedIngredientCount > 0 ? ` · need ${recipe.missedIngredientCount} more` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space(8),
  },
  errorTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 18,
    color: tokens.color.ink,
    marginBottom: tokens.space(2),
    textAlign: 'center',
  },
  helperText: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    marginTop: tokens.space(2),
    textAlign: 'center',
    lineHeight: 18,
  },
  list: {
    paddingBottom: tokens.space(8),
  },
  contextText: {
    fontFamily: tokens.font.body.regular,
    fontSize: 12,
    color: tokens.color.inkMuted,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(3),
    paddingBottom: tokens.space(2),
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: tokens.space(6),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.surfaceAlt,
    gap: tokens.space(3),
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: tokens.color.surfaceAlt,
  },
  rowText: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 15,
    color: tokens.color.ink,
    marginBottom: 4,
  },
  meta: {
    fontFamily: tokens.font.body.regular,
    fontSize: 12,
    color: tokens.color.inkMuted,
  },
});

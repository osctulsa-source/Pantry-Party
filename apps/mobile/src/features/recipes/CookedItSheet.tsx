/**
 * CookedItSheet — "I cooked this" confirmation.
 *
 * The closing step of the product loop (capture → expiry → cook → DECREMENT).
 * Shows the pantry items the recipe plausibly used (matched in core's
 * matchCookedItems) with an honest three-way choice per item:
 *
 *   Used up   → tombstone (deleted = 1), same path as a manual delete
 *   Used some → quantity − 1, floored at 1 (units are free text in v1, so
 *               whole-step decrement is the only honest math)
 *   Kept      → no change
 *
 * Matched items default to a sensible action (multiples decrement, singles
 * finish); unmatched fallback rows default to Kept. The user always confirms —
 * matching is a suggestion, not an authority.
 *
 * Writes go through PowerSync in one writeTransaction (drained to Postgres by
 * the upload-proxy's PATCH path — quantity and deleted are both PATCH-allowed).
 * Confirming also appends an on-device cook event (cookLog) for the future
 * streak mechanic.
 */
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import {
  decrementedQuantity,
  defaultCookAction,
  steppedFillLevel,
  type CookAction,
  type PantryItem,
} from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { BrandLoader } from '../../components/BrandDecor';
import { getPowerSync } from '../../data/powersync/db';
import { setPantryFillLevel, setPantryQuantity, tombstonePantryItems } from '../pantry/pantryWrites';
import { recordCookEvent } from './cookLog';
import { AddCookExtraSheet } from './AddCookExtraSheet';

export interface CookedSheetItem {
  itemId: string;
  itemName: string;
  quantity: number;
  /** True when core's matcher linked this item to a recipe ingredient. */
  matched: boolean;
  matchedIngredient?: string;
  /** For "Used a little" — undefined when the item never tracked fill level. */
  fillLevel: number | undefined;
}

export function CookedItSheet({
  recipeId,
  recipeTitle,
  items,
  pantryItems,
  householdId,
  onClose,
  onDone,
}: {
  recipeId: number;
  recipeTitle: string;
  items: CookedSheetItem[];
  pantryItems: PantryItem[];
  householdId: string | null;
  onClose: () => void;
  onDone: (updatedCount: number) => void;
}) {
  const [actions, setActions] = useState<Record<string, CookAction>>(() => {
    const initial: Record<string, CookAction> = {};
    for (const item of items) {
      initial[item.itemId] = item.matched ? defaultCookAction(item.quantity) : 'keep';
    }
    return initial;
  });
  const [extras, setExtras] = useState<CookedSheetItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allRows = [...items, ...extras];
  const actionFor = (itemId: string): CookAction => actions[itemId] ?? 'keep';
  const updateCount = allRows.filter((i) => actionFor(i.itemId) !== 'keep').length;

  function setAction(itemId: string, action: CookAction) {
    setActions((prev) => ({ ...prev, [itemId]: action }));
  }

  const alreadyShownIds = new Set(allRows.map((i) => i.itemId));

  function onPickExtra(pantryItem: PantryItem) {
    const row: CookedSheetItem = {
      itemId: pantryItem.id,
      itemName: pantryItem.name,
      quantity: pantryItem.quantity,
      matched: false,
      fillLevel: pantryItem.fillLevel,
    };
    setExtras((prev) => [...prev, row]);
    setActions((prev) => ({ ...prev, [row.itemId]: defaultCookAction(row.quantity) }));
    setPickerOpen(false);
  }

  async function onConfirm() {
    if (submitting) return;
    const updates = allRows
      .map((item) => ({ item, action: actionFor(item.itemId) }))
      .filter((u) => u.action !== 'keep');
    setError(null);
    setSubmitting(true);
    try {
      if (updates.length > 0) {
        const db = getPowerSync();
        const now = Date.now();
        await db.writeTransaction(async (tx) => {
          for (const u of updates) {
            if (u.action === 'use-up') {
              // Tombstone — identical to a manual delete from Edit Item.
              await tombstonePantryItems([u.item.itemId], tx, now);
            } else if (u.action === 'use-a-bit') {
              // Nudge the fill bar down one notch — the same primitive the
              // pantry row's manual tap uses, but floored (never wraps back
              // to full) so cooking can't accidentally "refill" an item.
              await setPantryFillLevel(u.item.itemId, steppedFillLevel(u.item.fillLevel), tx, now);
            } else {
              await setPantryQuantity(u.item.itemId, decrementedQuantity(u.item.quantity), tx, now);
            }
          }
        });
      }
      // Always log the cook — even when nothing was decremented — so streaks /
      // taste / History still see the household cooked this recipe.
      await recordCookEvent(householdId, {
        recipeId,
        recipeTitle,
        cookedAt: new Date().toISOString(),
        itemsUsed: updates.length,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDone(updates.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update your pantry. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>I cooked this</Text>
          <Text style={styles.title} numberOfLines={2}>
            {recipeTitle}
          </Text>
          <Text style={styles.hint}>
            {items.some((i) => i.matched)
              ? 'Mark what the recipe used — we matched these from your pantry.'
              : items.length > 0
                ? "We couldn't match ingredients automatically — here are items expiring soon you may have used."
                : "We couldn't match ingredients automatically — nothing urgent in your pantry to update."}
          </Text>

          {allRows.length === 0 ? (
            <Text style={styles.emptyTxt}>Nothing in your pantry to update.</Text>
          ) : (
            <ScrollView style={styles.rows} showsVerticalScrollIndicator={false}>
              {allRows.map((item) => {
                const action = actionFor(item.itemId);
                return (
                  <View key={item.itemId} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {item.itemName}
                        {item.quantity > 1 ? `  ×${item.quantity}` : ''}
                      </Text>
                      {item.matched && item.matchedIngredient && (
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          recipe uses {item.matchedIngredient}
                        </Text>
                      )}
                    </View>
                    <View style={styles.choices}>
                      <Choice
                        label="Used up"
                        selected={action === 'use-up'}
                        onPress={() => setAction(item.itemId, 'use-up')}
                      />
                      {item.quantity > 1 && (
                        <Choice
                          label="−1"
                          selected={action === 'use-some'}
                          onPress={() => setAction(item.itemId, 'use-some')}
                        />
                      )}
                      <Choice
                        label="Used a little"
                        selected={action === 'use-a-bit'}
                        onPress={() => setAction(item.itemId, 'use-a-bit')}
                      />
                      <Choice
                        label="Kept"
                        selected={action === 'keep'}
                        onPress={() => setAction(item.itemId, 'keep')}
                      />
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <Pressable
            onPress={() => setPickerOpen(true)}
            style={styles.addExtraRow}
            accessibilityRole="button"
            accessibilityLabel="Add something else you used"
          >
            <Text style={styles.addExtraTxt}>+ Add something else you used</Text>
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.confirm, submitting && styles.confirmDisabled]}
            onPress={onConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <BrandLoader variant="dots" size={22} />
            ) : (
              <Text style={styles.confirmTxt}>
                {updateCount > 0
                  ? `Update pantry (${updateCount})`
                  : 'Done — nothing used'}
              </Text>
            )}
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose} disabled={submitting}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </View>
      </View>
      </Modal>
      {pickerOpen && (
        <AddCookExtraSheet
          pantryItems={pantryItems}
          alreadyShownIds={alreadyShownIds}
          onPick={onPickExtra}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.choiceTxt, selected && styles.choiceTxtSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    // Explicit edges, not the StyleSheet absolute-fill spread helper — that
    // static is gone from this RN version's types (TS2551 on main; hotfix).
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(5),
    paddingBottom: tokens.space(8),
    maxHeight: '80%',
  },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: tokens.color.accent,
    marginBottom: tokens.space(1),
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 20,
    color: tokens.color.ink,
    letterSpacing: -0.3,
    lineHeight: 25,
    marginBottom: tokens.space(2),
  },
  hint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    lineHeight: 18,
    marginBottom: tokens.space(4),
  },
  rows: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space(3),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  rowText: { flex: 1 },
  rowName: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.ink },
  rowMeta: {
    fontFamily: tokens.font.body.regular,
    fontSize: 12,
    color: tokens.color.inkMuted,
    marginTop: 1,
  },
  choices: { flexDirection: 'row', gap: tokens.space(1) },
  choice: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.color.line,
  },
  choiceSelected: {
    backgroundColor: tokens.color.accentSoft,
    borderColor: tokens.color.accentSoft,
  },
  choiceTxt: { fontFamily: tokens.font.body.medium, fontSize: 12, color: tokens.color.inkMuted },
  choiceTxtSelected: { color: tokens.color.accent },
  emptyTxt: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    paddingVertical: tokens.space(4),
  },
  addExtraRow: {
    paddingVertical: tokens.space(3),
    alignItems: 'center',
  },
  addExtraTxt: {
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.color.accent,
  },
  error: {
    marginTop: tokens.space(3),
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.semantic.expiry.expired,
  },
  confirm: {
    marginTop: tokens.space(4),
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  confirmDisabled: { opacity: 0.6 },
  confirmTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
  cancel: {
    marginTop: tokens.space(2),
    paddingVertical: tokens.space(3),
    alignItems: 'center',
  },
  cancelTxt: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.inkMuted },
});

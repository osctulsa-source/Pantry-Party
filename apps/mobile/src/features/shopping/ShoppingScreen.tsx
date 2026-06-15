/**
 * ShoppingScreen — the household's shared shopping list (August arc, S2).
 *
 * One list per household (v1). Reactive over the synced shopping_list_items
 * table: unchecked items first (newest first), checked items dimmed below.
 *
 * Interactions:
 *   - Add row at top: type a name, Add — instant insert (quantity 1).
 *   - Tap a row: toggle checked (selection haptic). Checked = dimmed +
 *     struck through, sinks to the bottom group.
 *   - THE UNLOAD MOMENT: a checked row grows a "→ Pantry" action — one tap
 *     inserts it into the pantry (smart expiry via the shelf-life suggester,
 *     source 'restock') and tombstones the list row. Capture → shop →
 *     restock, closed.
 *   - ✕ on a row: remove (tombstone).
 *   - "Clear checked" header action: tombstone all checked rows in one
 *     transaction.
 *
 * Writes ride the existing PowerSync CRUD → upload-proxy path (PR #69's
 * table allowlists). All styling from theme/tokens (ADR-006).
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@powersync/react-native';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';

import { suggestExpiryISO, type ShoppingListItem } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { getPowerSync } from '../../data/powersync/db';
import { rowToShoppingListItem } from '../../data/powersync/mapShoppingRow';
import type { ShoppingListItemRow } from '../../data/powersync/schema';
import { addPantryItem } from '../pantry/addPantryItem';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';

const QUERY =
  'SELECT * FROM shopping_list_items WHERE deleted = 0 AND household_id = ? ' +
  'ORDER BY checked ASC, added_at DESC';

interface ShoppingSection {
  title: string;
  data: ShoppingListItem[];
}

export function ShoppingScreen() {
  const { activeHouseholdId } = useActiveHousehold();
  const { state: authState } = useAuth();
  const userId = authState.status === 'authenticated' ? authState.session.user.id : null;

  const { data: rows } = useQuery<ShoppingListItemRow>(QUERY, [activeHouseholdId ?? '']);
  const items = useMemo(() => rows.map(rowToShoppingListItem), [rows]);

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const open = useMemo(() => items.filter((i) => !i.checked), [items]);
  const done = useMemo(() => items.filter((i) => i.checked), [items]);
  const sections = useMemo<ShoppingSection[]>(() => {
    const out: ShoppingSection[] = [];
    if (open.length > 0) out.push({ title: 'To buy', data: open });
    if (done.length > 0) out.push({ title: 'In the cart', data: done });
    return out;
  }, [open, done]);

  function animate() {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
  }

  async function addItem() {
    const name = draft.trim();
    if (!name || !userId || !activeHouseholdId || busy) return;
    setBusy(true);
    try {
      await getPowerSync().execute(
        `INSERT INTO shopping_list_items
           (id, household_id, name, quantity, checked, source, added_by, added_at, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [Crypto.randomUUID(), activeHouseholdId, name, 1, 0, 'manual', userId, new Date().toISOString(), Date.now(), 0],
      );
      setDraft('');
      Haptics.selectionAsync().catch(() => {});
    } catch (e: unknown) {
      Alert.alert('Could not add', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleChecked(item: ShoppingListItem) {
    animate();
    Haptics.selectionAsync().catch(() => {});
    try {
      await getPowerSync().execute(
        'UPDATE shopping_list_items SET checked = ?, updated_at = ? WHERE id = ?',
        [item.checked ? 0 : 1, Date.now(), item.id],
      );
    } catch (e: unknown) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
    }
  }

  async function removeItem(item: ShoppingListItem) {
    animate();
    try {
      await getPowerSync().execute(
        'UPDATE shopping_list_items SET deleted = 1, updated_at = ? WHERE id = ?',
        [Date.now(), item.id],
      );
    } catch (e: unknown) {
      Alert.alert('Could not remove', e instanceof Error ? e.message : 'Try again.');
    }
  }

  /** The unload moment: checked item → pantry (smart expiry) + off the list. */
  async function moveToPantry(item: ShoppingListItem) {
    if (!userId || !activeHouseholdId || busy) return;
    setBusy(true);
    animate();
    try {
      await addPantryItem({
        householdId: activeHouseholdId,
        userId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit ?? null,
        location: 'pantry',
        expiresIso: suggestExpiryISO({ name: item.name }),
        source: 'restock',
      });
      await getPowerSync().execute(
        'UPDATE shopping_list_items SET deleted = 1, updated_at = ? WHERE id = ?',
        [Date.now(), item.id],
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: unknown) {
      Alert.alert('Could not move to pantry', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function clearChecked() {
    if (done.length === 0 || busy) return;
    setBusy(true);
    animate();
    try {
      const db = getPowerSync();
      const now = Date.now();
      await db.writeTransaction(async (tx) => {
        for (const item of done) {
          await tx.execute('UPDATE shopping_list_items SET deleted = 1, updated_at = ? WHERE id = ?', [
            now,
            item.id,
          ]);
        }
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: unknown) {
      Alert.alert('Could not clear', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.title}>Shopping</Text>
          <Text style={styles.count}>
            {open.length} to pick up
          </Text>
        </View>
        {done.length > 0 && (
          <Pressable onPress={clearChecked} hitSlop={8} disabled={busy}>
            <Text style={styles.clear}>Clear done</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="What do you need?"
          placeholderTextColor={tokens.color.inkMuted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addItem}
          returnKeyType="done"
          maxLength={120}
        />
        <Pressable
          style={[styles.addBtn, (!draft.trim() || busy) && styles.addBtnDisabled]}
          onPress={addItem}
          disabled={!draft.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel="Add to shopping list"
        >
          <Text style={styles.addBtnTxt}>Add</Text>
        </Pressable>
      </View>

      <SectionList<ShoppingListItem, ShoppingSection>
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        contentContainerStyle={items.length === 0 ? styles.listEmpty : styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>All stocked up</Text>
            <Text style={styles.emptySub}>
              When you run low on something or a recipe needs an ingredient you don't have, it'll
              show up here automatically.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggleChecked(item)}
            accessibilityRole="button"
            accessibilityState={{ checked: item.checked }}
            accessibilityLabel={`${item.name}${item.checked ? ', in the cart' : ''}`}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={[styles.checkbox, item.checked && styles.checkboxOn]}>
              {item.checked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View style={styles.rowMain}>
              <Text style={[styles.name, item.checked && styles.nameDone]} numberOfLines={1}>
                {item.name}
              </Text>
              {(item.quantity !== 1 || item.unit || item.note) && (
                <Text style={styles.meta} numberOfLines={1}>
                  {item.quantity !== 1 ? `${item.quantity}` : ''}
                  {item.unit ? ` ${item.unit}` : ''}
                  {item.note ? `${item.quantity !== 1 || item.unit ? ' · ' : ''}${item.note}` : ''}
                </Text>
              )}
            </View>
            {item.checked && (
              <Pressable
                onPress={() => moveToPantry(item)}
                hitSlop={6}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Move ${item.name} to pantry`}
                style={styles.pantryBtn}
              >
                <Text style={styles.pantryBtnTxt}>Stocked ✓</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => removeItem(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name} from the list`}
              style={styles.removeBtn}
            >
              <X size={15} color={tokens.color.inkMuted} />
            </Pressable>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(3),
  },
  headerMain: { flex: 1 },
  title: { fontFamily: tokens.font.display.bold, fontSize: 28, color: tokens.color.ink, letterSpacing: -0.5 },
  count: { marginTop: tokens.space(1), fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.inkMuted },
  clear: { paddingTop: tokens.space(2), fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.accent },
  addRow: { flexDirection: 'row', gap: tokens.space(2), marginHorizontal: tokens.space(6), marginBottom: tokens.space(3) },
  input: {
    flex: 1,
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.ink,
  },
  addBtn: {
    paddingHorizontal: tokens.space(5),
    justifyContent: 'center',
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.onAccent },
  list: { paddingBottom: tokens.space(8) },
  listEmpty: { flexGrow: 1 },
  sectionTitle: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(2),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingHorizontal: tokens.space(6),
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  rowPressed: { backgroundColor: tokens.color.surfaceAlt },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: tokens.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: tokens.color.accent, borderColor: tokens.color.accent },
  checkmark: { color: tokens.color.onAccent, fontSize: 13, fontFamily: tokens.font.body.semibold },
  rowMain: { flex: 1 },
  name: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.ink },
  nameDone: { color: tokens.color.inkMuted, textDecorationLine: 'line-through' },
  meta: { marginTop: 2, fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted },
  pantryBtn: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.accentSoft,
  },
  pantryBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.accent },
  removeBtn: { paddingLeft: tokens.space(1) },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.space(8) },
  emptyTitle: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 20,
    color: tokens.color.ink,
    marginBottom: tokens.space(2),
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});

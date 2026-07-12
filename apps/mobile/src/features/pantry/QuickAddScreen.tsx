/**
 * QuickAddScreen — personalized + configurable one-tap add.
 *
 * - "Your items": items you've added before (per-user, derived from synced pantry
 *   history via usePersonalBank) + any custom chips you pin. Tap to re-add with a
 *   smart expiry.
 * - Default staple sections, minus any you've hidden.
 * - Customize mode: pin/remove custom items and show/hide default sections. Layout
 *   config is saved per user on-device (useQuickAddConfig); the bank syncs itself.
 *
 * Refinement (guided specificity, PR 2): chips whose food has a known kind
 * guide carry a small chevron — the chip body stays one-tap instant-add, the
 * chevron opens RefineSheet (kind + brand + quantity) pre-filled. A refined
 * add registers the REFINED name in `added` (the base chip stays available:
 * penne tonight doesn't preclude spaghetti).
 *
 * Delight polish: the add itself is the most-repeated tap in the app, so it now
 * carries the Phase 3 haptic vocabulary — a quiet selection tick per quick-add
 * (light enough to fire on rapid repeat taps), a success notification on a
 * refined add, and a selection tick on the Customize toggle. A live "N added"
 * count springs in the title row as you batch-add, and a stale error clears the
 * moment the next add succeeds.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ChevronDown } from 'lucide-react-native';

import { guideFor, suggestExpiryISO, type StorageLocation } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { addPantryItem } from './addPantryItem';
import { QuickAddStaples } from './QuickAddStaples';
import { RefineSheet, type RefineResult } from './RefineSheet';
import { STAPLE_GROUPS } from './staples';
import { usePersonalBank } from './usePersonalBank';
import { useQuickAddConfig, type QuickAddConfig } from './useQuickAddConfig';

interface AddSpec {
  name: string;
  location: StorageLocation;
  category?: string;
  noExpiry?: boolean;
}

export function QuickAddScreen() {
  const { state } = useAuth();
  const { activeHouseholdId } = useActiveHousehold();
  const userId = state.status === 'authenticated' ? state.session.user.id : null;

  const bank = usePersonalBank(activeHouseholdId, userId);
  const { config, toggleGroup, addCustom, removeCustom } = useQuickAddConfig(userId);

  const [added, setAdded] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refining, setRefining] = useState<AddSpec | null>(null);

  // "Your items" = pinned custom items first, then the derived bank, de-duped by name.
  const yourItems = useMemo<AddSpec[]>(() => {
    const seen = new Set<string>();
    const out: AddSpec[] = [];
    for (const c of config.custom) {
      const k = c.name.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ name: c.name, location: c.location });
      }
    }
    for (const b of bank) {
      const k = b.name.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ name: b.name, location: b.location });
      }
    }
    return out;
  }, [config.custom, bank]);

  // A live tally of this session's adds, with a small spring "pop" each time it
  // ticks up — quiet feedback that batch-adding is landing.
  const addedCount = added.length;
  const countPop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (addedCount === 0) return;
    countPop.setValue(0.6);
    Animated.spring(countPop, { toValue: 1, friction: 5, tension: 170, useNativeDriver: true }).start();
  }, [addedCount, countPop]);

  async function addOne(spec: AddSpec) {
    if (!userId || !activeHouseholdId || added.includes(spec.name)) return;
    setError(null);
    try {
      await addPantryItem({
        householdId: activeHouseholdId,
        userId,
        name: spec.name,
        quantity: 1,
        location: spec.location,
        // The staple's curated location feeds the estimate too, so a fridge
        // staple gets a fridge duration (not the location-less default).
        expiresIso: spec.noExpiry
          ? null
          : suggestExpiryISO({ name: spec.name, category: spec.category, location: spec.location }),
        source: 'manual',
      });
      setAdded((prev) => [...prev, spec.name]);
      // Quiet selection tick — light enough to fire on rapid repeat taps.
      Haptics.selectionAsync().catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Insert from the refine sheet: refined name + brand + quantity, with the
   *  staple's location/expiry defaults. Registers the REFINED name in `added`
   *  so the base chip stays available for a different kind. */
  async function addRefined(base: AddSpec, result: RefineResult) {
    if (!userId || !activeHouseholdId) return;
    setError(null);
    try {
      await addPantryItem({
        householdId: activeHouseholdId,
        userId,
        name: result.name,
        brand: result.brand,
        quantity: result.quantity,
        location: base.location,
        expiresIso: base.noExpiry
          ? null
          : suggestExpiryISO({ name: result.name, category: base.category, location: base.location }),
        source: 'manual',
      });
      setAdded((prev) => (prev.includes(result.name) ? prev : [...prev, result.name]));
      // A refined add is deliberate — mark it with a success notification.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRefining(null);
    } catch (e: unknown) {
      setRefining(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function onAddCustom() {
    const name = newName.trim();
    if (!name) return;
    addCustom({ name, location: 'pantry' });
    setNewName('');
  }

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <View style={styles.titleLeft}>
            <Text style={styles.title}>Quick add</Text>
            {!editing && addedCount > 0 && (
              <Animated.View style={[styles.countBadge, { transform: [{ scale: countPop }] }]}>
                <Text style={styles.countBadgeTxt}>{addedCount} added</Text>
              </Animated.View>
            )}
          </View>
          <Pressable
            hitSlop={8}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setEditing((v) => !v);
            }}
          >
            <Text style={styles.customize}>{editing ? 'Done' : 'Customize'}</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {editing ? (
          <ManagePanel
            config={config}
            newName={newName}
            onChangeNewName={setNewName}
            onAddCustom={onAddCustom}
            onRemoveCustom={removeCustom}
            onToggleGroup={toggleGroup}
          />
        ) : (
          <>
            <Text style={styles.hint}>
              Tap to add — we set a sensible location and expiry. Added items show a ✓. Chips with a
              ⌄ can be refined (kind, brand, quantity).
            </Text>

            {yourItems.length > 0 && (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>Your items</Text>
                <View style={styles.chips}>
                  {yourItems.map((it) => {
                    const isAdded = added.includes(it.name);
                    const refinable = guideFor(it.name) !== undefined;
                    return (
                      <View key={it.name} style={[styles.staple, isAdded && styles.stapleAdded]}>
                        <Pressable onPress={() => addOne(it)} disabled={isAdded} hitSlop={4}>
                          <Text style={[styles.stapleTxt, isAdded && styles.stapleTxtAdded]}>
                            {isAdded ? `✓ ${it.name}` : `+ ${it.name}`}
                          </Text>
                        </Pressable>
                        {refinable && (
                          <Pressable
                            onPress={() => setRefining(it)}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={`Refine ${it.name} — choose kind or brand`}
                            style={styles.refineBtn}
                          >
                            <ChevronDown
                              size={13}
                              color={isAdded ? tokens.color.accent : tokens.color.inkMuted}
                            />
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <QuickAddStaples
              added={added}
              onAdd={(s) => addOne(s)}
              onRefine={(s) => setRefining(s)}
              hiddenGroups={config.hiddenGroups}
            />
          </>
        )}
      </ScrollView>

      {refining && (
        <RefineSheet
          baseName={refining.name}
          householdId={activeHouseholdId}
          onAdd={(result) => addRefined(refining, result)}
          onClose={() => setRefining(null)}
        />
      )}
    </SafeAreaView>
  );
}

function ManagePanel({
  config,
  newName,
  onChangeNewName,
  onAddCustom,
  onRemoveCustom,
  onToggleGroup,
}: {
  config: QuickAddConfig;
  newName: string;
  onChangeNewName: (v: string) => void;
  onAddCustom: () => void;
  onRemoveCustom: (name: string) => void;
  onToggleGroup: (title: string) => void;
}) {
  return (
    <View>
      <Text style={styles.hint}>
        Pin items you add often, and hide sections you don't use. Your items are pulled from what you've added before.
      </Text>

      <Text style={styles.groupTitle}>Pinned items</Text>
      {config.custom.length === 0 && <Text style={styles.muted}>None yet — add one below.</Text>}
      {config.custom.map((c) => (
        <View key={c.name} style={styles.manageRow}>
          <Text style={styles.manageLabel}>{c.name}</Text>
          <Pressable hitSlop={6} onPress={() => onRemoveCustom(c.name)}>
            <Text style={styles.removeTxt}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Add a custom item"
          placeholderTextColor={tokens.color.inkMuted}
          value={newName}
          onChangeText={onChangeNewName}
          onSubmitEditing={onAddCustom}
          returnKeyType="done"
        />
        <Pressable style={styles.addBtn} onPress={onAddCustom}>
          <Text style={styles.addBtnTxt}>Add</Text>
        </Pressable>
      </View>

      <Text style={[styles.groupTitle, styles.sectionGap]}>Default sections</Text>
      {STAPLE_GROUPS.map((g) => {
        const hidden = config.hiddenGroups.includes(g.title);
        return (
          <View key={g.title} style={styles.manageRow}>
            <Text style={styles.manageLabel}>{g.title}</Text>
            <Pressable
              hitSlop={6}
              onPress={() => onToggleGroup(g.title)}
              style={[styles.toggle, !hidden && styles.toggleOn]}
            >
              <Text style={[styles.toggleTxt, !hidden && styles.toggleTxtOn]}>{hidden ? 'Hidden' : 'Shown'}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  scroll: { padding: tokens.space(6), paddingBottom: tokens.space(10) },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.space(2) },
  titleLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3) },
  title: { fontFamily: tokens.font.display.bold, fontSize: 24, color: tokens.color.ink, letterSpacing: -0.4 },
  countBadge: {
    paddingHorizontal: tokens.space(3),
    paddingVertical: tokens.space(1),
    backgroundColor: tokens.color.accentSoft,
    borderRadius: 999,
  },
  countBadgeTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.accent },
  customize: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.accent },
  hint: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    lineHeight: 20,
    marginBottom: tokens.space(4),
  },
  error: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.semantic.expiry.expired,
    marginBottom: tokens.space(3),
  },
  group: { marginBottom: tokens.space(4) },
  groupTitle: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  sectionGap: { marginTop: tokens.space(6) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  staple: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
  stapleAdded: { backgroundColor: tokens.color.accentSoft },
  stapleTxt: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  stapleTxtAdded: { color: tokens.color.accent },
  refineBtn: {
    marginLeft: tokens.space(2),
    paddingLeft: tokens.space(2),
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: tokens.color.line,
  },
  muted: { fontFamily: tokens.font.body.regular, fontSize: 13, color: tokens.color.inkMuted, marginBottom: tokens.space(2) },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  manageLabel: { fontFamily: tokens.font.body.medium, fontSize: 15, color: tokens.color.ink },
  removeTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.semantic.expiry.expired },
  addRow: { flexDirection: 'row', gap: tokens.space(2), marginTop: tokens.space(3) },
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
  addBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.onAccent },
  toggle: {
    paddingVertical: tokens.space(1),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.color.line,
  },
  toggleOn: { backgroundColor: tokens.color.accentSoft, borderColor: tokens.color.accentSoft },
  toggleTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.inkMuted },
  toggleTxtOn: { color: tokens.color.accent },
});

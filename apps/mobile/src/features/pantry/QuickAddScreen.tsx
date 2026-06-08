/**
 * QuickAddScreen — personalized + configurable one-tap add.
 *
 * - "Your items": items you've added before (per-user, derived from synced pantry
 *   history via usePersonalBank) + any custom chips you pin. Tap to re-add with a
 *   smart expiry.
 * - Default staple sections, minus any you've hidden.
 * - Customize mode: pin/remove custom items and show/hide default sections. Layout
 *   config is saved per user on-device (useQuickAddConfig); the bank syncs itself.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { suggestExpiryISO, type StorageLocation } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { addPantryItem } from './addPantryItem';
import { QuickAddStaples } from './QuickAddStaples';
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

  async function addOne(spec: AddSpec) {
    if (!userId || !activeHouseholdId || added.includes(spec.name)) return;
    try {
      await addPantryItem({
        householdId: activeHouseholdId,
        userId,
        name: spec.name,
        quantity: 1,
        location: spec.location,
        expiresIso: spec.noExpiry ? null : suggestExpiryISO({ name: spec.name, category: spec.category }),
        source: 'manual',
      });
      setAdded((prev) => [...prev, spec.name]);
    } catch (e: unknown) {
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
          <Text style={styles.title}>Quick add</Text>
          <Pressable hitSlop={8} onPress={() => setEditing((v) => !v)}>
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
            <Text style={styles.hint}>Tap to add — we set a sensible location and expiry. Added items show a ✓.</Text>

            {yourItems.length > 0 && (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>Your items</Text>
                <View style={styles.chips}>
                  {yourItems.map((it) => {
                    const isAdded = added.includes(it.name);
                    return (
                      <Pressable
                        key={it.name}
                        onPress={() => addOne(it)}
                        disabled={isAdded}
                        style={[styles.staple, isAdded && styles.stapleAdded]}
                      >
                        <Text style={[styles.stapleTxt, isAdded && styles.stapleTxtAdded]}>
                          {isAdded ? `✓ ${it.name}` : `+ ${it.name}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <QuickAddStaples added={added} onAdd={(s) => addOne(s)} hiddenGroups={config.hiddenGroups} />
          </>
        )}
      </ScrollView>
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
  title: { fontFamily: tokens.font.display.bold, fontSize: 24, color: tokens.color.ink, letterSpacing: -0.4 },
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
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
  stapleAdded: { backgroundColor: tokens.color.accentSoft },
  stapleTxt: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  stapleTxtAdded: { color: tokens.color.accent },
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

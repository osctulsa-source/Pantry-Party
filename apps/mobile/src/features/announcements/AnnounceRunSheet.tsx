/**
 * AnnounceRunSheet — compose a shopping-run announcement with window chips,
 * optional store hint, and a "Notify household" button.
 */
import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { RUN_WINDOWS, type RunWindowId } from '@breadbox/core';

import { tokens } from '../../theme/tokens';
import { announceRun } from './announceRun';

export function AnnounceRunSheet({
  visible,
  householdId,
  userId,
  onDone,
  onClose,
}: {
  visible: boolean;
  householdId: string;
  userId: string;
  onDone: (runId: string) => void;
  onClose: () => void;
}) {
  const [window, setWindow] = useState<RunWindowId>('30min');
  const [storeHint, setStoreHint] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (busy) return;
    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const id = await announceRun({
        householdId,
        userId,
        window,
        storeHint: storeHint.trim() || undefined,
      });
      onDone(id);
    } catch {
      // best-effort — announceRun caught its own errors
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Announce a shopping run</Text>
          <Text style={styles.label}>I'll head out…</Text>
          <View style={styles.chipRow}>
            {RUN_WINDOWS.map((w) => {
              const selected = w.id === window;
              return (
                <Pressable
                  key={w.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setWindow(w.id);
                  }}
                  style={[styles.chip, selected && styles.chipSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={w.label}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {w.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Store (optional) — e.g., Kroger"
            placeholderTextColor={tokens.color.inkMuted}
            value={storeHint}
            onChangeText={setStoreHint}
            maxLength={80}
            autoCorrect={false}
            returnKeyType="done"
          />
          <Pressable
            style={[styles.submit, busy && styles.submitDisabled]}
            onPress={onSubmit}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Notify household"
          >
            <Text style={styles.submitText}>Notify household</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(5),
    paddingBottom: tokens.space(10),
  },
  title: {
    fontFamily: tokens.font.display.semibold,
    fontSize: 18,
    color: tokens.color.ink,
    marginBottom: tokens.space(4),
  },
  label: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2), marginBottom: tokens.space(4) },
  chip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  chipSelected: { backgroundColor: tokens.color.accent },
  chipText: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  chipTextSelected: { color: tokens.color.onAccent },
  input: {
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.ink,
    marginBottom: tokens.space(4),
  },
  submit: {
    backgroundColor: tokens.color.accent,
    paddingVertical: tokens.space(3),
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
});

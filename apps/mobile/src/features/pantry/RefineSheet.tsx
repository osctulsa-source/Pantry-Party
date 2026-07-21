/**
 * RefineSheet — compact bottom sheet for refining a quick-add staple.
 *
 * Quick Add's promise is one tap; this sheet is the explicit opt-in for the
 * times you care about specifics. Opened from a chip's chevron (never from
 * the chip body — tap stays instant-add), pre-filled from the staple:
 *
 *   kind chips    — from the staple's food guide (a refined base like
 *                   "Penne pasta" opens with Penne already selected)
 *   brand chips   — household learned brands first, guide seeds fill to 6
 *                   (same merge as the Add/Edit forms), plus free text
 *   quantity      — simple ±1 stepper (1–99)
 *
 * The live Add button label shows exactly what will be inserted ("Add 2
 * Penne pasta"). The parent owns the actual insert + close, mirroring
 * QuickAddScreen's addOne path.
 *
 * Layout follows the CookedItSheet pattern: absolutely-positioned backdrop +
 * bottom-anchored card, with EXPLICIT position edges — never
 * StyleSheet.absoluteFillObject (removed in RN 0.8x; see PR #49).
 */
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { guideFor, makeRefinedName, plainName } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { BrandLoader } from '../../components/BrandDecor';
import { SuggestChips } from './SuggestChips';
import { useLearnedBrands } from './useLearnedBrands';

export interface RefineResult {
  name: string;
  brand: string | null;
  quantity: number;
}

export function RefineSheet({
  baseName,
  householdId,
  onAdd,
  onClose,
}: {
  baseName: string;
  householdId: string | null;
  onAdd: (result: RefineResult) => Promise<void>;
  onClose: () => void;
}) {
  const match = useMemo(() => guideFor(baseName), [baseName]);
  const [kind, setKind] = useState<string | null>(match?.activeKind ?? null);
  const [brand, setBrand] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  const name = match
    ? kind
      ? makeRefinedName(match.guide, kind)
      : plainName(match.guide)
    : baseName;

  const learned = useLearnedBrands(householdId, match ? match.guide.food : baseName);
  const brandOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const b of [...learned, ...(match?.guide.brands ?? [])]) {
      const key = b.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(b);
      }
      if (out.length >= 6) break;
    }
    return out;
  }, [learned, match]);

  const trimmedBrand = brand.trim();

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      await onAdd({ name, brand: trimmedBrand || null, quantity });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      // The parent owns error surfacing; don't let a rejected onAdd become an
      // unhandled rejection here. The finally still clears busy so the sheet
      // stays interactive for a retry.
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close refine sheet" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Quick add · refine</Text>
          <Text style={styles.title}>{name}</Text>

          {match && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Which kind?</Text>
              <SuggestChips
                options={match.guide.kinds}
                selected={kind}
                onPick={(k) => setKind(k === kind ? null : k)}
                accessibilityPrefix="Set kind"
              />
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Brand (optional)</Text>
            {brandOptions.length > 0 && (
              <View style={styles.brandChips}>
                <SuggestChips
                  options={brandOptions}
                  selected={trimmedBrand || null}
                  onPick={(b) => setBrand(b.toLowerCase() === trimmedBrand.toLowerCase() ? '' : b)}
                  accessibilityPrefix="Set brand"
                />
              </View>
            )}
            <TextInput
              style={styles.input}
              placeholder="e.g. Barilla"
              placeholderTextColor={tokens.color.inkMuted}
              value={brand}
              onChangeText={setBrand}
              maxLength={120}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Quantity</Text>
            <View style={styles.qtyRow}>
              <Pressable
                style={styles.stepBtn}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                accessibilityRole="button"
                accessibilityLabel="Decrease quantity"
              >
                <Text style={styles.stepTxt}>−</Text>
              </Pressable>
              <Text style={styles.qtyTxt}>{quantity}</Text>
              <Pressable
                style={styles.stepBtn}
                onPress={() => setQuantity((q) => Math.min(99, q + 1))}
                accessibilityRole="button"
                accessibilityLabel="Increase quantity"
              >
                <Text style={styles.stepTxt}>＋</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[styles.addBtn, busy && styles.addBtnBusy]}
            onPress={submit}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Add ${quantity} ${name}`}
          >
            {busy ? (
              <BrandLoader variant="dots" size={22} />
            ) : (
              <Text style={styles.addBtnTxt}>
                Add {quantity > 1 ? `${quantity} ` : ''}
                {name}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} disabled={busy} style={styles.cancel} hitSlop={6}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Explicit edges, not absoluteFillObject (RN 0.8x removed it — PR #49).
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(5),
    paddingBottom: tokens.space(8),
  },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(1),
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 22,
    color: tokens.color.ink,
    letterSpacing: -0.3,
    marginBottom: tokens.space(4),
  },
  section: { marginBottom: tokens.space(4) },
  sectionLabel: {
    fontFamily: tokens.font.body.medium,
    fontSize: 12,
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  brandChips: { marginBottom: tokens.space(2) },
  input: {
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.ink,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(4) },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTxt: { fontFamily: tokens.font.body.semibold, fontSize: 18, color: tokens.color.accent },
  qtyTxt: {
    minWidth: 32,
    textAlign: 'center',
    fontFamily: tokens.font.body.semibold,
    fontSize: 18,
    color: tokens.color.ink,
    fontVariant: ['tabular-nums'],
  },
  addBtn: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    marginTop: tokens.space(1),
  },
  addBtnBusy: { opacity: 0.7 },
  addBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
  cancel: { alignItems: 'center', paddingTop: tokens.space(4) },
  cancelTxt: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.inkMuted },
});

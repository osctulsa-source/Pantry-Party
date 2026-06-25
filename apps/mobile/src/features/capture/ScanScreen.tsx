/**
 * ScanScreen — barcode capture (Capture I, C2), with two modes.
 *
 * CameraView (expo-camera) with retail barcode types, a Crumb viewfinder, and a
 * torch toggle. A persisted segmented control picks the capture mode:
 *
 *  - "Scan a bunch" (basket, default): each barcode is looked up and dropped
 *    straight into a basket — no per-item confirm — so a fresh haul scans in one
 *    uninterrupted pass. A basket bar tracks the count; Review opens
 *    ScanReviewSheet to edit names/quantities and bulk-add everything at once.
 *  - "One at a time" (confirm): the original flow — the frame freezes into a
 *    CONFIRM card that springs up (Delight D2), product image scaling in, and
 *    Add inserts immediately. Best for a single item.
 *
 * Both share the camera, the debounce, the Open Food Facts lookup, and
 * addPantryItem with the smart-expiry suggester. OFF misses never dead-end:
 * confirm mode shows the card with an empty name; basket mode keeps the row as
 * "name this" in review. Every scan records hit/miss to the on-device scanLog.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { ShoppingBasket, Zap, ZapOff } from 'lucide-react-native';

import { suggestExpiryISO } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { addPantryItem } from '../pantry/addPantryItem';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { lookupBarcode, type OffProduct } from '../../data/openFoodFacts';
import { recordScan } from './scanLog';
import { ScanReviewSheet, type ScanBasketItem } from './ScanReviewSheet';
import type { RootStackParamList } from '../../../App';

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;
const DEBOUNCE_MS = 2500;
const SCAN_MODE_KEY = 'scanMode';
const MAX_BASKET = 50;

type ScanMode = 'basket' | 'confirm';

type Phase =
  | { kind: 'scanning' }
  | { kind: 'looking'; barcode: string }
  | { kind: 'confirm'; barcode: string; product: OffProduct | null };

export function ScanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Scan'>>();
  const { activeHouseholdId } = useActiveHousehold();
  const { state: authState } = useAuth();
  const userId = authState.status === 'authenticated' ? authState.session.user.id : null;

  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  const [torch, setTorch] = useState(false);
  const [mode, setMode] = useState<ScanMode>('basket');

  // confirm-mode state
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);

  // basket-mode state
  const [basket, setBasket] = useState<ScanBasketItem[]>([]);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [addingAll, setAddingAll] = useState(false);

  const lastScan = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  // D2: confirm card spring entrance — slides up from below with overshoot.
  const cardSlide = useRef(new Animated.Value(300)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const thumbScale = useRef(new Animated.Value(0.7)).current;

  // Restore the last-used capture mode (per-device UX preference).
  useEffect(() => {
    AsyncStorage.getItem(SCAN_MODE_KEY)
      .then((v) => {
        if (v === 'basket' || v === 'confirm') setMode(v);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (phase.kind === 'confirm') {
      cardSlide.setValue(300);
      cardOpacity.setValue(0);
      thumbScale.setValue(0.7);
      Animated.parallel([
        Animated.spring(cardSlide, { toValue: 0, tension: 65, friction: 9, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(thumbScale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true, delay: 150 }),
      ]).start();
    }
  }, [phase.kind, cardSlide, cardOpacity, thumbScale]);

  function selectMode(next: ScanMode) {
    setMode(next);
    AsyncStorage.setItem(SCAN_MODE_KEY, next).catch(() => {});
  }

  async function onBarcode(result: BarcodeScanningResult) {
    if (phase.kind !== 'scanning') return;
    const code = result.data;
    const now = Date.now();
    if (!code || (lastScan.current.code === code && now - lastScan.current.at < DEBOUNCE_MS)) return;
    lastScan.current = { code, at: now };

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPhase({ kind: 'looking', barcode: code });
    const product = await lookupBarcode(code);
    void recordScan(activeHouseholdId, code, product?.name != null);

    if (mode === 'confirm') {
      setName(product?.name ?? '');
      setBrand(product?.brand ?? '');
      setPhase({ kind: 'confirm', barcode: code, product });
      return;
    }

    // basket mode: drop it in and keep scanning — dedupe by barcode (bump qty).
    setBasket((prev) => {
      const existing = prev.find((b) => b.barcode === code);
      if (existing) {
        return prev.map((b) => (b.barcode === code ? { ...b, qty: Math.min(99, b.qty + 1) } : b));
      }
      if (prev.length >= MAX_BASKET) return prev;
      return [
        ...prev,
        {
          key: `${code}-${now}`,
          barcode: code,
          name: product?.name ?? '',
          brand: product?.brand ?? null,
          sizeText: product?.quantityText ?? null,
          imageUrl: product?.imageUrl ?? null,
          qty: 1,
        },
      ];
    });
    setLastAdded(product?.name || 'Unknown item');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setPhase({ kind: 'scanning' });
  }

  async function confirmAdd() {
    if (phase.kind !== 'confirm') return;
    const trimmed = name.trim();
    if (!trimmed || !userId || !activeHouseholdId || busy) return;
    setBusy(true);
    try {
      await addPantryItem({
        householdId: activeHouseholdId,
        userId,
        name: trimmed,
        brand: brand.trim() || null,
        quantity: 1,
        location: 'pantry',
        expiresIso: suggestExpiryISO({ name: trimmed }),
        source: 'barcode',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setAdded((n) => n + 1);
      resumeScanning();
    } finally {
      setBusy(false);
    }
  }

  function resumeScanning() {
    setName('');
    setBrand('');
    setPhase({ kind: 'scanning' });
  }

  function renameBasket(key: string, value: string) {
    setBasket((prev) => prev.map((b) => (b.key === key ? { ...b, name: value } : b)));
  }
  function qtyBasket(key: string, delta: number) {
    setBasket((prev) =>
      prev.map((b) => (b.key === key ? { ...b, qty: Math.max(1, Math.min(99, b.qty + delta)) } : b)),
    );
  }
  function removeBasket(key: string) {
    setBasket((prev) => prev.filter((b) => b.key !== key));
  }

  async function onAddAll() {
    if (!userId || !activeHouseholdId || addingAll) return;
    const addable = basket.filter((b) => b.name.trim().length > 0);
    if (addable.length === 0) return;
    setAddingAll(true);
    try {
      for (const b of addable) {
        const nm = b.name.trim();
        await addPantryItem({
          householdId: activeHouseholdId,
          userId,
          name: nm,
          brand: b.brand?.trim() || null,
          quantity: b.qty,
          location: 'pantry',
          expiresIso: suggestExpiryISO({ name: nm }),
          source: 'barcode',
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } finally {
      setAddingAll(false);
    }
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={tokens.color.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.permTitle}>Point, scan, done</Text>
          <Text style={styles.permSub}>
            The fastest way to fill your pantry. We only use the camera while you're on this screen
            — nothing is stored.
          </Text>
          <Pressable style={styles.permBtn} onPress={() => void requestPermission()}>
            <Text style={styles.permBtnTxt}>Turn on the camera</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const confirming = phase.kind === 'confirm';

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={
            phase.kind === 'scanning' && !reviewOpen ? (r) => void onBarcode(r) : undefined
          }
        />
        <View style={styles.viewfinder} pointerEvents="none" />
        <Pressable
          style={styles.torchBtn}
          onPress={() => setTorch((t) => !t)}
          accessibilityRole="button"
          accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
        >
          {torch ? (
            <Zap size={18} color={tokens.color.onAccent} />
          ) : (
            <ZapOff size={18} color={tokens.color.onAccent} />
          )}
        </Pressable>
        {mode === 'confirm' && added > 0 && phase.kind === 'scanning' && (
          <View style={styles.addedChip} pointerEvents="none">
            <Text style={styles.addedChipTxt}>
              {'✓'} {added} added — keep going!
            </Text>
          </View>
        )}
      </View>

      <View style={styles.panel}>
        {phase.kind === 'scanning' && (
          <View style={styles.segment}>
            <Pressable
              style={[styles.segBtn, mode === 'basket' && styles.segBtnOn]}
              onPress={() => selectMode('basket')}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'basket' }}
            >
              <Text style={[styles.segTxt, mode === 'basket' && styles.segTxtOn]}>Scan a bunch</Text>
            </Pressable>
            <Pressable
              style={[styles.segBtn, mode === 'confirm' && styles.segBtnOn]}
              onPress={() => selectMode('confirm')}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'confirm' }}
            >
              <Text style={[styles.segTxt, mode === 'confirm' && styles.segTxtOn]}>One at a time</Text>
            </Pressable>
          </View>
        )}

        {phase.kind === 'scanning' && (
          <>
            <Text style={styles.hint}>
              {mode === 'basket' ? 'Point at barcodes — they stack up below' : 'Point at any barcode'}
            </Text>
            {mode === 'confirm' && (
              <Pressable onPress={() => navigation.navigate('BulkPaste')} hitSlop={8}>
                <Text style={styles.bulkLink}>Or paste a list</Text>
              </Pressable>
            )}
          </>
        )}

        {phase.kind === 'looking' && (
          <View style={styles.lookupRow}>
            <ActivityIndicator color={tokens.color.accent} />
            <Text style={styles.hint}>Looking that up...</Text>
          </View>
        )}

        {confirming && phase.kind === 'confirm' && (
          <Animated.View style={{ transform: [{ translateY: cardSlide }], opacity: cardOpacity }}>
            <View style={styles.confirmHead}>
              {phase.product?.imageUrl ? (
                <Animated.Image
                  source={{ uri: phase.product.imageUrl }}
                  style={[styles.thumb, { transform: [{ scale: thumbScale }] }]}
                />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={styles.confirmMeta}>
                <Text style={styles.confirmEyebrow}>
                  {phase.product?.name ? 'Got it!' : 'New to us — type the name'}
                </Text>
                <Text style={styles.confirmCode}>
                  {phase.barcode}
                  {phase.product?.quantityText ? ` · ${phase.product.quantityText}` : ''}
                </Text>
              </View>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Item name"
              placeholderTextColor={tokens.color.inkMuted}
              value={name}
              onChangeText={setName}
              autoFocus={!phase.product?.name}
              maxLength={100}
            />
            <TextInput
              style={styles.input}
              placeholder="Brand (optional)"
              placeholderTextColor={tokens.color.inkMuted}
              value={brand}
              onChangeText={setBrand}
              maxLength={120}
              autoCapitalize="words"
            />
            <Pressable
              style={[styles.addBtn, (!name.trim() || busy) && styles.addBtnDisabled]}
              onPress={() => void confirmAdd()}
              disabled={!name.trim() || busy}
              accessibilityRole="button"
              accessibilityLabel="Add scanned item to pantry"
            >
              {busy ? (
                <ActivityIndicator color={tokens.color.onAccent} />
              ) : (
                <Text style={styles.addBtnTxt}>Add this</Text>
              )}
            </Pressable>
            <Pressable style={styles.skip} onPress={resumeScanning} disabled={busy} hitSlop={6}>
              <Text style={styles.skipTxt}>Skip, keep scanning</Text>
            </Pressable>
          </Animated.View>
        )}

        {phase.kind === 'scanning' && basket.length > 0 && (
          <Pressable
            style={styles.basketBar}
            onPress={() => setReviewOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Review ${basket.length} scanned items`}
          >
            <View style={styles.basketIcon}>
              <ShoppingBasket size={18} color={tokens.color.accent} />
            </View>
            <View style={styles.basketMeta}>
              <Text style={styles.basketCount}>
                {basket.length} {basket.length === 1 ? 'item' : 'items'}
              </Text>
              {lastAdded && (
                <Text style={styles.basketSub} numberOfLines={1}>
                  Last: {lastAdded}
                </Text>
              )}
            </View>
            <Text style={styles.basketBtn}>Review ›</Text>
          </Pressable>
        )}
      </View>

      <ScanReviewSheet
        visible={reviewOpen}
        items={basket}
        busy={addingAll}
        onClose={() => setReviewOpen(false)}
        onRename={renameBasket}
        onQty={qtyBasket}
        onRemove={removeBasket}
        onAddAll={() => void onAddAll()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.space(8) },
  permTitle: { fontFamily: tokens.font.display.semibold, fontSize: 20, color: tokens.color.ink, marginBottom: tokens.space(2) },
  permSub: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: tokens.space(5),
  },
  permBtn: { backgroundColor: tokens.color.accent, paddingVertical: tokens.space(3), paddingHorizontal: tokens.space(6), borderRadius: tokens.radius.md },
  permBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  viewfinder: {
    position: 'absolute',
    top: '28%',
    left: '12%',
    right: '12%',
    height: 140,
    borderWidth: 2,
    borderColor: tokens.color.onAccent,
    borderRadius: tokens.radius.md,
    opacity: 0.85,
  },
  torchBtn: {
    position: 'absolute',
    top: tokens.space(4),
    right: tokens.space(4),
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedChip: {
    position: 'absolute',
    bottom: tokens.space(4),
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(4),
    borderRadius: 999,
  },
  addedChipTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: '#FFFFFF' },
  panel: { paddingHorizontal: tokens.space(6), paddingVertical: tokens.space(4) },
  segment: {
    flexDirection: 'row',
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
    padding: 3,
    marginBottom: tokens.space(4),
  },
  segBtn: { flex: 1, paddingVertical: tokens.space(2), borderRadius: 999, alignItems: 'center' },
  segBtnOn: { backgroundColor: tokens.color.accent },
  segTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.inkMuted },
  segTxtOn: { color: tokens.color.onAccent },
  hint: { fontFamily: tokens.font.body.regular, fontSize: 14, color: tokens.color.inkMuted },
  bulkLink: { marginTop: tokens.space(2), fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.accent },
  lookupRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3) },
  confirmHead: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3), marginBottom: tokens.space(3) },
  thumb: { width: 48, height: 48, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.surfaceAlt },
  thumbEmpty: { borderWidth: 1, borderColor: tokens.color.line },
  confirmMeta: { flex: 1 },
  confirmEyebrow: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.ink },
  confirmCode: { marginTop: 2, fontFamily: tokens.font.mono, fontSize: 12, color: tokens.color.inkMuted },
  input: {
    marginBottom: tokens.space(3),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.ink,
  },
  addBtn: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
  skip: { alignItems: 'center', paddingTop: tokens.space(3) },
  skipTxt: { fontFamily: tokens.font.body.medium, fontSize: 14, color: tokens.color.inkMuted },
  basketBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    marginTop: tokens.space(4),
    padding: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.lg,
  },
  basketIcon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  basketMeta: { flex: 1 },
  basketCount: { fontFamily: tokens.font.display.bold, fontSize: 16, color: tokens.color.ink },
  basketSub: { fontFamily: tokens.font.body.regular, fontSize: 11.5, color: tokens.color.inkMuted, marginTop: 1 },
  basketBtn: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.accent },
});

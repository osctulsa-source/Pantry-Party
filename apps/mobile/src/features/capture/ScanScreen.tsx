/**
 * ScanScreen — barcode capture (Capture I, C2), with two modes.
 *
 * CameraView (expo-camera) with retail barcode types, QR codes, and a text
 * capture path (on-device OCR via expo-mlkit-ocr). A Crumb viewfinder, torch
 * toggle, and persisted controls pick the capture target and mode:
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
import { ShoppingBasket, Zap, ZapOff, ScanLine, QrCode, Type } from 'lucide-react-native';

import { suggestExpiryISO, suggestStorageLocation, type CaptureSource } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { addOrMergePantryItem } from '../pantry/addPantryItem';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { useFavoriteStores } from '../settings/useFavoriteStores';
import { lookupBarcode, type OffProduct } from '../../data/openFoodFacts';
import { recordScan } from './scanLog';
import { ScanReviewSheet, type ScanBasketItem } from './ScanReviewSheet';
import { resolveScanPayload } from './resolveScanPayload';
import { runTextOcr, TextOcrEmptyError, TextOcrUnavailableError } from './runTextOcr';
import type { RootStackParamList } from '../../../App';

const RETAIL_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;
const QR_TYPES = ['qr'] as const;
const DEBOUNCE_MS = 2500;
const SCAN_MODE_KEY = 'scanMode';
const SCAN_TARGET_KEY = 'scanTarget';
const MAX_BASKET = 50;
// No barcode for this long while scanning → the camera is probably struggling
// (glare, distance, low light). Swap the hint to troubleshooting guidance.
const STRUGGLE_MS = 7000;
// "Looking that up..." for this long → it's the network, not their aim.
const LOOKUP_SLOW_MS = 2500;

type ScanMode = 'basket' | 'confirm';
type ScanTarget = 'barcode' | 'qr' | 'text';

type Phase =
  | { kind: 'scanning' }
  | { kind: 'looking'; barcode: string }
  | { kind: 'confirm'; barcode: string; product: OffProduct | null; scanNote?: string };

export function ScanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Scan'>>();
  const { activeHouseholdId } = useActiveHousehold();
  const { state: authState } = useAuth();
  const userId = authState.status === 'authenticated' ? authState.session.user.id : null;
  const { stores: favoriteStores } = useFavoriteStores(userId);

  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  const [torch, setTorch] = useState(false);
  const [mode, setMode] = useState<ScanMode>('basket');
  const [target, setTarget] = useState<ScanTarget>('barcode');
  const [cameraReady, setCameraReady] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [detectedStore, setDetectedStore] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);

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

  // Feedback states: nothing scanned for a while / lookup dragging on.
  const [struggling, setStruggling] = useState(false);
  const [lookupSlow, setLookupSlow] = useState(false);

  const lastScan = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  // D2: confirm card spring entrance — slides up from below with overshoot.
  const cardSlide = useRef(new Animated.Value(300)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const thumbScale = useRef(new Animated.Value(0.7)).current;

  // Restore the last-used capture mode + target (per-device UX preference).
  useEffect(() => {
    AsyncStorage.getItem(SCAN_MODE_KEY)
      .then((v) => {
        if (v === 'basket' || v === 'confirm') setMode(v);
      })
      .catch(() => {});
    AsyncStorage.getItem(SCAN_TARGET_KEY)
      .then((v) => {
        if (v === 'barcode' || v === 'qr' || v === 'text') setTarget(v);
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

  // Struggle timer: arms whenever we're live-scanning, clears on any barcode
  // (phase leaves 'scanning') or when the review sheet pauses the camera.
  useEffect(() => {
    if (phase.kind !== 'scanning' || reviewOpen) {
      setStruggling(false);
      return;
    }
    const t = setTimeout(() => setStruggling(true), STRUGGLE_MS);
    return () => clearTimeout(t);
  }, [phase.kind, reviewOpen]);

  // Slow-lookup timer: same shape, for the 'looking' phase.
  useEffect(() => {
    if (phase.kind !== 'looking') {
      setLookupSlow(false);
      return;
    }
    const t = setTimeout(() => setLookupSlow(true), LOOKUP_SLOW_MS);
    return () => clearTimeout(t);
  }, [phase.kind]);

  function selectMode(next: ScanMode) {
    setMode(next);
    AsyncStorage.setItem(SCAN_MODE_KEY, next).catch(() => {});
  }

  function selectTarget(next: ScanTarget) {
    setTarget(next);
    setOcrError(null);
    setDetectedStore(null);
    AsyncStorage.setItem(SCAN_TARGET_KEY, next).catch(() => {});
    if (phase.kind !== 'scanning') resumeScanning();
  }

  function pushNamesToBasket(names: string[], sourceTag: string) {
    const now = Date.now();
    setBasket((prev) => {
      let next = [...prev];
      for (const name of names) {
        if (next.length >= MAX_BASKET) break;
        next = [
          ...next,
          {
            key: `${sourceTag}-${name}-${now}-${next.length}`,
            barcode: sourceTag,
            name,
            brand: null,
            sizeText: null,
            imageUrl: null,
            qty: 1,
          },
        ];
      }
      return next;
    });
    if (names.length > 0) {
      setLastAdded(names[names.length - 1] ?? null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }

  async function handleRetailBarcode(code: string) {
    setPhase({ kind: 'looking', barcode: code });
    const product = await lookupBarcode(code);
    void recordScan(activeHouseholdId, code, product?.name != null);

    if (mode === 'confirm') {
      setName(product?.name ?? '');
      setBrand(product?.brand ?? '');
      setPhase({ kind: 'confirm', barcode: code, product });
      return;
    }

    setBasket((prev) => {
      const existing = prev.find((b) => b.barcode === code);
      if (existing) {
        return prev.map((b) => (b.barcode === code ? { ...b, qty: Math.min(99, b.qty + 1) } : b));
      }
      if (prev.length >= MAX_BASKET) return prev;
      return [
        ...prev,
        {
          key: `${code}-${Date.now()}`,
          barcode: code,
          name: product?.name ?? '',
          brand: product?.brand ?? null,
          sizeText: product?.quantityText ?? null,
          imageUrl: product?.imageUrl ?? null,
          qty: 1,
        },
      ];
    });
    setLastAdded(product?.name || 'Unknown item — needs a name');
    Haptics.notificationAsync(
      product?.name != null
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {});
    setPhase({ kind: 'scanning' });
  }

  async function onBarcode(result: BarcodeScanningResult) {
    if (phase.kind !== 'scanning' || target === 'text') return;
    const code = result.data;
    const now = Date.now();
    if (!code || (lastScan.current.code === code && now - lastScan.current.at < DEBOUNCE_MS)) return;
    lastScan.current = { code, at: now };

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const payload = resolveScanPayload(code, result.type);

    if (payload.kind === 'retail_barcode' && payload.lookupCode) {
      await handleRetailBarcode(payload.lookupCode);
      return;
    }

    if (payload.kind === 'qr_item_list' && payload.itemNames) {
      if (mode === 'basket') {
        pushNamesToBasket(payload.itemNames, 'QR');
        setPhase({ kind: 'scanning' });
      } else {
        setName(payload.itemNames[0] ?? '');
        setBrand('');
        setPhase({
          kind: 'confirm',
          barcode: code,
          product: null,
          scanNote: `${payload.itemNames.length} items found in QR`,
        });
      }
      return;
    }

    if (payload.kind === 'qr_url') {
      setName('');
      setBrand('');
      setPhase({ kind: 'confirm', barcode: code, product: null, scanNote: payload.url });
      return;
    }

    setName(payload.itemNames?.[0] ?? payload.raw.slice(0, 100));
    setBrand('');
    setPhase({ kind: 'confirm', barcode: code, product: null, scanNote: 'QR text' });
  }

  async function captureText() {
    if (!cameraRef.current || !cameraReady || ocrBusy || phase.kind !== 'scanning') return;
    setOcrError(null);
    setOcrBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) throw new TextOcrEmptyError();
      const ocr = await runTextOcr(photo.uri, {
        favoriteStores: favoriteStores.map((s) => ({ id: s.id, name: s.name })),
      });
      setDetectedStore(ocr.detectedStore?.name ?? null);
      pushNamesToBasket(ocr.items, 'TEXT');
      setReviewOpen(true);
    } catch (e: unknown) {
      if (e instanceof TextOcrUnavailableError) {
        setOcrError('Text scan needs a newer app build. Try paste-a-list instead.');
      } else if (e instanceof TextOcrEmptyError) {
        setOcrError(e.message);
      } else {
        setOcrError('Could not read that — try brighter light and hold steady.');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setOcrBusy(false);
    }
  }

  function basketSource(tag: string): CaptureSource {
    if (tag === 'TEXT') return 'receipt';
    if (tag === 'QR') return 'manual';
    return 'barcode';
  }

  async function confirmAdd() {
    if (phase.kind !== 'confirm') return;
    const trimmed = name.trim();
    if (!trimmed || !userId || !activeHouseholdId || busy) return;
    setBusy(true);
    try {
      // Infer where the food naturally lives, then estimate expiry AT that
      // location — storing milk as "pantry" while estimating with a fridge
      // duration is how scanned items used to get wildly wrong dates.
      const location = suggestStorageLocation(trimmed) ?? 'pantry';
      await addOrMergePantryItem({
        householdId: activeHouseholdId,
        userId,
        name: trimmed,
        brand: brand.trim() || null,
        quantity: 1,
        location,
        expiresIso: suggestExpiryISO({ name: trimmed, location }),
        source: target === 'qr' ? 'manual' : 'barcode',
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
        // Same location-consistent estimate as the single-item confirm path.
        const location = suggestStorageLocation(nm) ?? 'pantry';
        await addOrMergePantryItem({
          householdId: activeHouseholdId,
          userId,
          name: nm,
          brand: b.brand?.trim() || null,
          quantity: b.qty,
          location,
          expiresIso: suggestExpiryISO({ name: nm, location }),
          source: basketSource(b.barcode),
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
  const unnamedCount = basket.filter((b) => b.name.trim().length === 0).length;
  const barcodeTypes = target === 'qr' ? [...QR_TYPES] : target === 'barcode' ? [...RETAIL_TYPES] : [];

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <View style={styles.cameraWrap}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={barcodeTypes.length > 0 ? { barcodeTypes } : undefined}
          onBarcodeScanned={
            target !== 'text' && phase.kind === 'scanning' && !reviewOpen
              ? (r) => void onBarcode(r)
              : undefined
          }
          onCameraReady={() => setCameraReady(true)}
        />
        <View style={[styles.viewfinder, struggling && styles.viewfinderStruggling]} pointerEvents="none" />
        {struggling && phase.kind === 'scanning' && (
          <View style={styles.struggleChip} pointerEvents="none">
            <Text style={styles.struggleChipTxt}>Fill the frame — close and steady</Text>
          </View>
        )}
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
          <View style={styles.targetRow}>
            <Pressable
              style={[styles.targetBtn, target === 'barcode' && styles.targetBtnOn]}
              onPress={() => selectTarget('barcode')}
              accessibilityRole="button"
              accessibilityState={{ selected: target === 'barcode' }}
            >
              <ScanLine size={14} color={target === 'barcode' ? tokens.color.onAccent : tokens.color.inkMuted} />
              <Text style={[styles.targetTxt, target === 'barcode' && styles.targetTxtOn]}>Barcode</Text>
            </Pressable>
            <Pressable
              style={[styles.targetBtn, target === 'qr' && styles.targetBtnOn]}
              onPress={() => selectTarget('qr')}
              accessibilityRole="button"
              accessibilityState={{ selected: target === 'qr' }}
            >
              <QrCode size={14} color={target === 'qr' ? tokens.color.onAccent : tokens.color.inkMuted} />
              <Text style={[styles.targetTxt, target === 'qr' && styles.targetTxtOn]}>QR</Text>
            </Pressable>
            <Pressable
              style={[styles.targetBtn, target === 'text' && styles.targetBtnOn]}
              onPress={() => selectTarget('text')}
              accessibilityRole="button"
              accessibilityState={{ selected: target === 'text' }}
            >
              <Type size={14} color={target === 'text' ? tokens.color.onAccent : tokens.color.inkMuted} />
              <Text style={[styles.targetTxt, target === 'text' && styles.targetTxtOn]}>Text</Text>
            </Pressable>
          </View>
        )}

        {phase.kind === 'scanning' && target !== 'text' && (
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

        {phase.kind === 'scanning' && target !== 'text' && !struggling && (
          <>
            <Text style={styles.hint}>
              {target === 'qr'
                ? 'Point at a QR code — lists and links work too'
                : mode === 'basket'
                  ? 'Point at barcodes — they stack up below'
                  : 'Point at any barcode'}
            </Text>
            {mode === 'confirm' && (
              <Pressable onPress={() => navigation.navigate('BulkPaste')} hitSlop={8}>
                <Text style={styles.bulkLink}>Or paste a list</Text>
              </Pressable>
            )}
          </>
        )}

        {phase.kind === 'scanning' && target === 'text' && (
          <>
            <Text style={styles.hint}>
              {favoriteStores.length === 0
                ? 'Point at a receipt or label, then tap Read text'
                : 'Point at a receipt — we’ll use your saved stores to read it better'}
            </Text>
            <Pressable
              style={[styles.captureBtn, (!cameraReady || ocrBusy) && styles.captureBtnDisabled]}
              onPress={() => void captureText()}
              disabled={!cameraReady || ocrBusy}
              accessibilityRole="button"
              accessibilityLabel="Read text from camera"
            >
              {ocrBusy ? (
                <ActivityIndicator color={tokens.color.onAccent} />
              ) : (
                <Text style={styles.captureBtnTxt}>Read text</Text>
              )}
            </Pressable>
            {detectedStore && (
              <Text style={styles.detectedStore}>Read as {detectedStore}</Text>
            )}
            {ocrError && <Text style={styles.ocrError}>{ocrError}</Text>}
            {favoriteStores.length === 0 && (
              <Pressable
                onPress={() => navigation.navigate('FavoriteStores')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Add your stores in settings"
              >
                <Text style={styles.bulkLink}>Add your stores for better reads</Text>
              </Pressable>
            )}
            <Pressable onPress={() => navigation.navigate('BulkPaste')} hitSlop={8}>
              <Text style={styles.bulkLink}>Or type it instead</Text>
            </Pressable>
          </>
        )}

        {phase.kind === 'scanning' && target !== 'text' && struggling && (
          <>
            <Text style={[styles.hint, styles.hintStruggling]}>
              Not reading? Get closer so the barcode fills the frame.
            </Text>
            <View style={styles.struggleActions}>
              {!torch && (
                <Pressable
                  onPress={() => setTorch(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Turn on the light"
                >
                  <Text style={styles.bulkLink}>Turn on the light</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => navigation.navigate('BulkPaste')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Type or paste a list instead"
              >
                <Text style={styles.bulkLink}>Type it instead</Text>
              </Pressable>
            </View>
          </>
        )}

        {phase.kind === 'looking' && (
          <View style={styles.lookupRow}>
            <ActivityIndicator color={tokens.color.accent} />
            <Text style={styles.hint}>
              {lookupSlow ? 'Still looking — slow connection…' : 'Looking that up...'}
            </Text>
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
                  {phase.product?.name
                    ? 'Got it!'
                    : phase.scanNote?.startsWith('http')
                      ? 'QR link — name this item'
                      : 'New to us — type the name'}
                </Text>
                <Text style={styles.confirmCode}>
                  {phase.scanNote?.startsWith('http') ? phase.scanNote : phase.barcode}
                  {phase.product?.quantityText ? ` · ${phase.product.quantityText}` : ''}
                  {phase.scanNote && !phase.scanNote.startsWith('http') ? ` · ${phase.scanNote}` : ''}
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
              {unnamedCount > 0 ? (
                <Text style={[styles.basketSub, styles.basketSubWarn]} numberOfLines={1}>
                  {unnamedCount} {unnamedCount === 1 ? 'needs' : 'need'} a name — tap Review
                </Text>
              ) : (
                lastAdded && (
                  <Text style={styles.basketSub} numberOfLines={1}>
                    Last: {lastAdded}
                  </Text>
                )
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
        storeLabel={detectedStore}
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
  // Amber = "we're not getting a read" (paired with the struggle chip + hint).
  viewfinderStruggling: { borderColor: tokens.color.warning, opacity: 1 },
  struggleChip: {
    position: 'absolute',
    top: '28%',
    alignSelf: 'center',
    marginTop: 148,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(4),
    borderRadius: 999,
  },
  struggleChipTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: '#FFFFFF' },
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
  targetRow: {
    flexDirection: 'row',
    gap: tokens.space(2),
    marginBottom: tokens.space(3),
  },
  targetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space(1),
    paddingVertical: tokens.space(2),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  targetBtnOn: { backgroundColor: tokens.color.accent },
  targetTxt: { fontFamily: tokens.font.body.semibold, fontSize: 12, color: tokens.color.inkMuted },
  targetTxtOn: { color: tokens.color.onAccent },
  captureBtn: {
    marginTop: tokens.space(3),
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  captureBtnDisabled: { opacity: 0.5 },
  captureBtnTxt: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.onAccent },
  ocrError: {
    marginTop: tokens.space(2),
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.warning,
  },
  detectedStore: {
    marginTop: tokens.space(2),
    fontFamily: tokens.font.body.semibold,
    fontSize: 13,
    color: tokens.color.accent,
  },
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
  hintStruggling: { color: tokens.color.warning, fontFamily: tokens.font.body.semibold },
  struggleActions: { flexDirection: 'row', gap: tokens.space(5) },
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
  basketSubWarn: { color: tokens.color.warning, fontFamily: tokens.font.body.semibold },
  basketBtn: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.accent },
});

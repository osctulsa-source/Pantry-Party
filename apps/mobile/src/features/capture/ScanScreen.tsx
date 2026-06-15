/**
 * ScanScreen — barcode capture (Capture I, C2).
 *
 * CameraView (expo-camera, Rebuild 2) with retail barcode types, a Crumb
 * viewfinder, and a torch toggle. Detection is debounced; a hit haptic fires,
 * the frame freezes into a CONFIRM card (Open Food Facts prefill — name,
 * brand, package size, thumbnail; everything editable), and Add inserts via
 * addPantryItem with the smart-expiry suggester, source 'barcode'.
 *
 * OFF misses (unknown product / offline / timeout) fall back to the same card
 * with the barcode shown and the name empty — capture never dead-ends.
 * "Add another" resumes scanning for continuous capture. Every scan records
 * hit/miss to the on-device scanLog (the ≥90% capture-gate dataset).
 *
 * "Paste a list instead" links the bulk-paste interim path (receipt OCR's
 * stand-in until the dataset-gated October arc).
 */
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Zap, ZapOff } from 'lucide-react-native';

import { suggestExpiryISO } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { addPantryItem } from '../pantry/addPantryItem';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';
import { useAuth } from '../auth/AuthContext';
import { lookupBarcode, type OffProduct } from '../../data/openFoodFacts';
import { recordScan } from './scanLog';
import type { RootStackParamList } from '../../../App';

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;
const DEBOUNCE_MS = 2500;

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
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);
  const lastScan = useRef<{ code: string; at: number }>({ code: '', at: 0 });

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
    setName(product?.name ?? '');
    setBrand(product?.brand ?? '');
    setPhase({ kind: 'confirm', barcode: code, product });
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
          onBarcodeScanned={phase.kind === 'scanning' ? (r) => void onBarcode(r) : undefined}
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
        {added > 0 && phase.kind === 'scanning' && (
          <View style={styles.addedChip} pointerEvents="none">
            <Text style={styles.addedChipTxt}>
              ✓ {added} added — keep going!
            </Text>
          </View>
        )}
      </View>

      <View style={styles.panel}>
        {phase.kind === 'scanning' && (
          <>
            <Text style={styles.hint}>Point at any barcode</Text>
            <Pressable onPress={() => navigation.navigate('BulkPaste')} hitSlop={8}>
              <Text style={styles.bulkLink}>Or paste a list</Text>
            </Pressable>
          </>
        )}

        {phase.kind === 'looking' && (
          <View style={styles.lookupRow}>
            <ActivityIndicator color={tokens.color.accent} />
            <Text style={styles.hint}>Looking that up…</Text>
          </View>
        )}

        {confirming && phase.kind === 'confirm' && (
          <View>
            <View style={styles.confirmHead}>
              {phase.product?.imageUrl ? (
                <Image source={{ uri: phase.product.imageUrl }} style={styles.thumb} />
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
          </View>
        )}
      </View>
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
});

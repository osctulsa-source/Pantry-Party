/**
 * ScanReviewSheet — the batch-review sheet for "Scan a bunch" (Capture).
 *
 * Basket mode (ScanScreen) racks each scanned barcode in here instead of
 * confirming one at a time. This sheet is the single review step: fix a name,
 * bump a quantity, drop a mistake, or name a barcode Open Food Facts couldn't
 * resolve. "Add N" bulk-inserts every NAMED row via addPantryItem (the parent
 * owns the loop), so each item inherits auto-category + smart best-before.
 *
 * Controlled + presentational: all basket state lives in ScanScreen; this emits
 * rename / qty / remove / addAll callbacks. Unnamed rows (OFF misses) are held
 * back from the count until named.
 */
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Minus, Plus, X } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';

export interface ScanBasketItem {
  /** Stable row key (barcode + capture time). */
  key: string;
  barcode: string;
  /** '' when Open Food Facts had no name — the row needs naming before it adds. */
  name: string;
  brand: string | null;
  /** OFF free-text size ("500 g") — display only. */
  sizeText: string | null;
  imageUrl: string | null;
  qty: number;
}

export function ScanReviewSheet({
  visible,
  items,
  busy,
  storeLabel,
  onClose,
  onRename,
  onQty,
  onRemove,
  onAddAll,
}: {
  visible: boolean;
  items: ScanBasketItem[];
  busy: boolean;
  /** When OCR detected a favorite store on the receipt. */
  storeLabel?: string | null;
  onClose: () => void;
  onRename: (key: string, name: string) => void;
  onQty: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
  onAddAll: () => void;
}) {
  const addable = items.filter((i) => i.name.trim().length > 0).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']} style={styles.safe}>
            <View style={styles.head}>
              <View style={styles.headText}>
                <Text style={styles.title}>
                  Review · {items.length} {items.length === 1 ? 'item' : 'items'}
                </Text>
                <Text style={styles.sub}>
                  {storeLabel ? `From ${storeLabel} · edit anything, then add` : 'Edit anything, then add to your pantry'}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close review">
                <X size={22} color={tokens.color.inkMuted} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {items.length === 0 ? (
                <Text style={styles.empty}>Nothing scanned yet.</Text>
              ) : (
                items.map((it) => {
                  const unnamed = it.name.trim().length === 0;
                  const meta = [it.brand, it.sizeText].filter(Boolean).join(' · ');
                  return (
                    <View key={it.key} style={[styles.row, unnamed && styles.rowUnknown]}>
                      {it.imageUrl ? (
                        <Image source={{ uri: it.imageUrl }} style={styles.thumb} />
                      ) : (
                        <View style={[styles.thumb, styles.thumbEmpty]} />
                      )}
                      <View style={styles.rtext}>
                        <TextInput
                          style={[styles.nameInput, unnamed && styles.nameInputUnknown]}
                          value={it.name}
                          onChangeText={(t) => onRename(it.key, t)}
                          placeholder="Name this item"
                          placeholderTextColor={tokens.color.warning}
                          maxLength={100}
                        />
                        <Text style={styles.rsub} numberOfLines={1}>
                          {unnamed ? `Unknown barcode · ${it.barcode}` : meta || it.barcode}
                        </Text>
                      </View>
                      <View style={styles.stepper}>
                        <Pressable
                          onPress={() => onQty(it.key, -1)}
                          hitSlop={4}
                          style={styles.sb}
                          accessibilityRole="button"
                          accessibilityLabel="Decrease quantity"
                        >
                          <Minus size={14} color={tokens.color.accent} />
                        </Pressable>
                        <Text style={styles.sv}>{it.qty}</Text>
                        <Pressable
                          onPress={() => onQty(it.key, 1)}
                          hitSlop={4}
                          style={styles.sb}
                          accessibilityRole="button"
                          accessibilityLabel="Increase quantity"
                        >
                          <Plus size={14} color={tokens.color.accent} />
                        </Pressable>
                      </View>
                      <Pressable
                        onPress={() => onRemove(it.key)}
                        hitSlop={8}
                        style={styles.rx}
                        accessibilityRole="button"
                        accessibilityLabel="Remove item"
                      >
                        <X size={16} color={tokens.color.inkMuted} />
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <Text style={styles.note}>Best-before &amp; category are set automatically.</Text>
            <Pressable
              style={[styles.cta, (addable === 0 || busy) && styles.ctaDisabled]}
              onPress={onAddAll}
              disabled={addable === 0 || busy}
              accessibilityRole="button"
              accessibilityLabel={`Add ${addable} items to pantry`}
            >
              {busy ? (
                <ActivityIndicator color={tokens.color.onAccent} />
              ) : (
                <Text style={styles.ctaTxt}>{addable === 0 ? 'Name an item to add' : `Add ${addable} to pantry`}</Text>
              )}
            </Pressable>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,16,8,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    maxHeight: '86%',
    minHeight: '50%',
  },
  safe: { paddingHorizontal: tokens.space(6), paddingTop: tokens.space(5), flexShrink: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: tokens.space(3) },
  headText: { flex: 1 },
  title: { fontFamily: tokens.font.display.bold, fontSize: 22, color: tokens.color.ink, letterSpacing: -0.3 },
  sub: { fontFamily: tokens.font.body.regular, fontSize: 12.5, color: tokens.color.inkMuted, marginTop: 3 },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: tokens.space(2) },
  empty: { fontFamily: tokens.font.body.regular, fontSize: 14, color: tokens.color.inkMuted, paddingVertical: tokens.space(6), textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(3),
    paddingVertical: tokens.space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  rowUnknown: {
    backgroundColor: tokens.color.warnSoft,
    borderBottomWidth: 0,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space(3),
    marginVertical: tokens.space(1),
  },
  thumb: { width: 44, height: 44, borderRadius: tokens.radius.sm, flex: 0, backgroundColor: tokens.color.surfaceAlt },
  thumbEmpty: { borderWidth: 1, borderColor: tokens.color.line },
  rtext: { flex: 1, minWidth: 0 },
  nameInput: { fontFamily: tokens.font.body.semibold, fontSize: 14, color: tokens.color.ink, padding: 0 },
  nameInputUnknown: { color: tokens.color.warning },
  rsub: { fontFamily: tokens.font.body.regular, fontSize: 11, color: tokens.color.inkMuted, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2), flex: 0 },
  sb: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sv: { fontFamily: tokens.font.display.bold, fontSize: 14, color: tokens.color.ink, minWidth: 12, textAlign: 'center' },
  rx: { paddingLeft: tokens.space(1) },
  note: {
    fontFamily: tokens.font.body.regular,
    fontSize: 12,
    color: tokens.color.inkMuted,
    paddingTop: tokens.space(3),
    paddingBottom: tokens.space(2),
  },
  cta: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    marginBottom: tokens.space(2),
  },
  ctaDisabled: { opacity: 0.5 },
  ctaTxt: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.onAccent },
});

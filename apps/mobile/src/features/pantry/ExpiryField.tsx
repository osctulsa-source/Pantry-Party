/**
 * ExpiryField — dependency-free "best before" picker.
 *
 * Models expiry as days-from-today (number | null). Quick relative presets cover
 * the common cases; ±1-day steppers fine-tune; "No date" clears it. The caller
 * pre-fills a smart default (shelf-life suggestion) so the user adjusts rather
 * than types a date — no native date-picker module required.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addDaysUTC } from '@breadbox/core';

import { tokens } from '../../theme/tokens';

const PRESETS: Array<{ label: string; days: number | null }> = [
  { label: 'No date', days: null },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function relative(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  if (days < 365) return `in ${Math.round(days / 30)} months`;
  return days >= 547 ? `in ${Math.round(days / 365)} years` : 'in 1 year';
}

export function ExpiryField({
  valueDays,
  onChange,
}: {
  valueDays: number | null;
  onChange: (days: number | null) => void;
}) {
  const date = valueDays === null ? null : addDaysUTC(new Date(), valueDays);
  const friendly =
    date && valueDays !== null ? `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} · ${relative(valueDays)}` : 'No expiry date';

  return (
    <View>
      <View style={styles.dateRow}>
        <Text style={[styles.dateText, valueDays === null && styles.dateMuted]}>{friendly}</Text>
        {valueDays !== null && (
          <View style={styles.steppers}>
            <Pressable hitSlop={6} onPress={() => onChange(Math.max(0, valueDays - 1))} style={styles.stepBtn}>
              <Text style={styles.stepTxt}>−1d</Text>
            </Pressable>
            <Pressable hitSlop={6} onPress={() => onChange(valueDays + 1)} style={styles.stepBtn}>
              <Text style={styles.stepTxt}>+1d</Text>
            </Pressable>
          </View>
        )}
      </View>
      <View style={styles.presets}>
        {PRESETS.map((p) => {
          const selected = p.days === valueDays;
          return (
            <Pressable key={p.label} onPress={() => onChange(p.days)} style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.space(3),
  },
  dateText: { fontFamily: tokens.font.body.semibold, fontSize: 15, color: tokens.color.ink },
  dateMuted: { fontFamily: tokens.font.body.regular, color: tokens.color.inkMuted },
  steppers: { flexDirection: 'row', gap: tokens.space(2) },
  stepBtn: {
    paddingVertical: tokens.space(1),
    paddingHorizontal: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.sm,
  },
  stepTxt: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.accent },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  chip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
  chipSelected: { backgroundColor: tokens.color.accent },
  chipText: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  chipTextSelected: { color: tokens.color.onAccent },
});

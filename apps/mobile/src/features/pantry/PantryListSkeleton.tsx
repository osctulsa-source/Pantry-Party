/**
 * PantryListSkeleton — loading placeholder for the Pantry tab.
 *
 * Mirrors the real layout (title, action row, search, a section header, and a
 * few item rows) so the first paint hints at what's coming instead of a bare
 * spinner. Rendered inside the screen's SafeAreaView during the initial load.
 */
import { StyleSheet, View } from 'react-native';

import { tokens } from '../../theme/tokens';
import { Skeleton } from '../../components/Skeleton';

export function PantryListSkeleton() {
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Skeleton style={styles.title} />
      <Skeleton style={styles.count} />
      <View style={styles.actions}>
        <Skeleton style={styles.action} />
        <Skeleton style={styles.action} />
        <Skeleton style={styles.action} />
      </View>
      <Skeleton style={styles.search} />
      <Skeleton style={styles.section} />
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.row}>
          <View style={styles.rowMain}>
            <Skeleton style={styles.name} />
            <Skeleton style={styles.meta} />
          </View>
          <Skeleton style={styles.pill} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: tokens.space(6), paddingTop: tokens.space(4) },
  title: { width: 120, height: 28, borderRadius: 8 },
  count: { width: 64, height: 13, borderRadius: 6, marginTop: tokens.space(2) },
  actions: { flexDirection: 'row', gap: tokens.space(3), marginTop: tokens.space(3) },
  action: { flex: 1, height: 44, borderRadius: tokens.radius.md },
  search: { width: '100%', height: 40, borderRadius: tokens.radius.md, marginTop: tokens.space(3) },
  section: { width: 80, height: 12, borderRadius: 6, marginTop: tokens.space(4), marginBottom: tokens.space(1) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.line,
  },
  rowMain: { flex: 1 },
  name: { width: '55%', height: 16, borderRadius: 7 },
  meta: { width: '35%', height: 12, borderRadius: 6, marginTop: tokens.space(2) },
  pill: { width: 52, height: 22, borderRadius: 999 },
});

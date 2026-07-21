/**
 * CookSkeleton — loading placeholder for the Cook tab feed.
 * SimmeringLoader leads; skeleton cards keep layout stable underneath.
 */
import { StyleSheet, View } from 'react-native';

import { tokens } from '../../theme/tokens';
import { Skeleton } from '../../components/Skeleton';
import { SimmeringLoader } from '../../motion';

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton style={styles.image} />
      <Skeleton style={styles.title} />
      <Skeleton style={styles.match} />
      <View style={styles.actions}>
        <Skeleton style={styles.action} />
        <Skeleton style={styles.action} />
        <Skeleton style={styles.action} />
      </View>
      <Skeleton style={styles.cooked} />
    </View>
  );
}

export function CookSkeleton() {
  return (
    <View style={styles.wrap}>
      <SimmeringLoader label="Simmering recipes…" size={64} style={styles.simmer} />
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: tokens.space(6), paddingTop: tokens.space(2) },
  simmer: { marginBottom: tokens.space(4) },
  card: { marginBottom: tokens.space(6) },
  image: { width: '100%', height: 170, borderRadius: tokens.radius.lg },
  title: { width: '70%', height: 20, borderRadius: 8, marginTop: tokens.space(3) },
  match: { width: '45%', height: 12, borderRadius: 6, marginTop: tokens.space(2) },
  actions: { flexDirection: 'row', gap: tokens.space(2), marginTop: tokens.space(4) },
  action: { flex: 1, height: 44, borderRadius: tokens.radius.md },
  cooked: { width: '100%', height: 44, borderRadius: tokens.radius.md, marginTop: tokens.space(2) },
});

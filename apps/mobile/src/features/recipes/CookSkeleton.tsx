/**
 * CookSkeleton — loading placeholder for the Cook tab body (the hero recipe
 * card). The header / meal chips / controls stay live above it; this stands in
 * for the card while Spoonacular responds, instead of a bare spinner.
 */
import { StyleSheet, View } from 'react-native';

import { tokens } from '../../theme/tokens';
import { Skeleton } from '../../components/Skeleton';

export function CookSkeleton() {
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: tokens.space(6), paddingTop: tokens.space(2) },
  image: { width: '100%', height: 170, borderRadius: tokens.radius.lg },
  title: { width: '70%', height: 20, borderRadius: 8, marginTop: tokens.space(3) },
  match: { width: '45%', height: 12, borderRadius: 6, marginTop: tokens.space(2) },
  actions: { flexDirection: 'row', gap: tokens.space(2), marginTop: tokens.space(4) },
  action: { flex: 1, height: 44, borderRadius: tokens.radius.md },
  cooked: { width: '100%', height: 44, borderRadius: tokens.radius.md, marginTop: tokens.space(2) },
});

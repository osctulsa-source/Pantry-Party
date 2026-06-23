/**
 * ScreenHeader — the shared top band for the main tabs (declutter pass).
 *
 * A big serif title with an optional muted subtitle on the left, and an
 * optional trailing slot on the right (a single action or a small cluster).
 * Owns the standard band padding so it drops in as the first child of a
 * screen's SafeAreaView / Screen — every tab gets the same title rhythm
 * without re-declaring header styles. Pantry, Cook, Shopping, and Settings
 * all compose this.
 */
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../theme/tokens';

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.main}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(3),
  },
  main: { flex: 1 },
  title: { fontFamily: tokens.font.display.bold, fontSize: 28, color: tokens.color.ink, letterSpacing: -0.5 },
  subtitle: {
    marginTop: tokens.space(1),
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3), paddingTop: tokens.space(2) },
});

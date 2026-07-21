/**
 * UI primitives — the start of the token-driven component layer (ADR-006).
 *
 * Screens compose these instead of re-declaring StyleSheet color/font/spacing
 * literals, so a brand or theme change flows through automatically. This is the
 * foundation the remaining screens migrate onto over subsequent PRs.
 *
 * Primitives: Screen · Heading · Body · Caption · Input · Button · Card · ListRow.
 */
import { type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '../theme/tokens';
import { BrandLoader } from './BrandDecor';

type Edge = 'top' | 'right' | 'bottom' | 'left';

export function Screen({
  children,
  edges = ['top', 'left', 'right'],
  style,
}: {
  children: ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

export function Heading({
  children,
  size = 'lg',
  style,
}: {
  children: ReactNode;
  size?: 'xl' | 'lg' | 'md';
  style?: StyleProp<TextStyle>;
}) {
  const sizeStyle = size === 'xl' ? styles.headingXl : size === 'lg' ? styles.headingLg : styles.headingMd;
  return <Text style={[styles.heading, sizeStyle, style]}>{children}</Text>;
}

export function Body({
  children,
  tone = 'default',
  weight = 'regular',
  size = 15,
  style,
}: {
  children: ReactNode;
  tone?: 'default' | 'muted' | 'accent';
  weight?: 'regular' | 'medium' | 'semibold';
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  const color =
    tone === 'muted' ? tokens.color.inkMuted : tone === 'accent' ? tokens.color.accent : tokens.color.ink;
  const fontFamily =
    weight === 'semibold'
      ? tokens.font.body.semibold
      : weight === 'medium'
        ? tokens.font.body.medium
        : tokens.font.body.regular;
  return (
    <Text style={[{ color, fontFamily, fontSize: size, lineHeight: Math.round(size * 1.4) }, style]}>
      {children}
    </Text>
  );
}

export function Caption({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.caption, style]}>{children}</Text>;
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={tokens.color.inkMuted} {...props} style={[styles.input, props.style]} />;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        isPrimary ? styles.btnPrimary : styles.btnSecondary,
        (disabled || loading) && styles.btnDisabled,
        pressed && styles.btnPressed,
        style,
      ]}
    >
      {loading ? (
        <BrandLoader variant="dots" size={22} />
      ) : (
        <Text style={[styles.btnText, isPrimary ? styles.btnTextPrimary : styles.btnTextSecondary]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ListRow({ label, value, icon, onPress }: { label: string; value?: string; icon?: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.listRow, pressed && onPress ? styles.listRowPressed : null]}
    >
      <View style={styles.listRowLeft}>
        {icon ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{icon}</View> : null}
        <Text style={styles.listRowLabel}>{label}</Text>
      </View>
      <View style={styles.listRowRight}>
        {value ? <Text style={styles.listRowValue}>{value}</Text> : null}
        {onPress ? <Text style={styles.listRowChevron}>›</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.surface },
  heading: { fontFamily: tokens.font.display.bold, color: tokens.color.ink, letterSpacing: -0.5 },
  headingXl: { fontSize: 28 },
  headingLg: { fontSize: 20 },
  headingMd: { fontSize: 17 },
  caption: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
  },
  input: {
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 16,
    color: tokens.color.ink,
  },
  btn: {
    height: 50,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space(5),
  },
  btnPrimary: { backgroundColor: tokens.color.accent },
  btnSecondary: { borderWidth: 1.5, borderColor: tokens.color.accent, backgroundColor: 'transparent' },
  btnDisabled: { opacity: 0.6 },
  btnPressed: { opacity: 0.85 },
  btnText: { fontFamily: tokens.font.body.semibold, fontSize: 16 },
  btnTextPrimary: { color: tokens.color.onAccent },
  btnTextSecondary: { color: tokens.color.accent },
  card: { backgroundColor: tokens.color.surfaceAlt, borderRadius: tokens.radius.lg, padding: tokens.space(4) },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.space(4),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
  },
  listRowPressed: { opacity: 0.7 },
  listRowLabel: { fontFamily: tokens.font.body.semibold, fontSize: 16, color: tokens.color.ink },
  listRowLeft: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(3), flexShrink: 1 },
  listRowRight: { flexDirection: 'row', alignItems: 'center', gap: tokens.space(2) },
  listRowValue: { fontFamily: tokens.font.body.regular, fontSize: 14, color: tokens.color.inkMuted },
  listRowChevron: { fontFamily: tokens.font.body.regular, fontSize: 22, color: tokens.color.inkMuted },
});

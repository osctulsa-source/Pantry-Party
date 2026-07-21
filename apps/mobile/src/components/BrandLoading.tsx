/**
 * BrandLoading — branded stand-in for ActivityIndicator.
 *
 * Full-screen boot gates use the default size + optional message; buttons and
 * inline rows pass a smaller `size` (and often omit the message).
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { tokens } from '../theme/tokens';
import { BrandLoader, type BrandLoaderVariant } from './BrandDecor';

export function BrandLoading({
  message,
  variant = 'carousel-dots',
  size = 44,
  style,
}: {
  message?: string;
  variant?: BrandLoaderVariant;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? 'Loading'}
    >
      <BrandLoader variant={variant} size={size} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

/** Full-bleed boot gate (auth, fonts, sync). */
export function BrandLoadingScreen({
  message = 'Loading your pantry…',
  variant = 'carousel-dots',
}: {
  message?: string;
  variant?: BrandLoaderVariant;
}) {
  return (
    <View style={styles.screen}>
      <BrandLoading message={message} variant={variant} size={48} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.space(8),
  },
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space(4),
  },
  message: {
    fontFamily: tokens.font.body.medium,
    fontSize: 15,
    color: tokens.color.accent,
    textAlign: 'center',
  },
});

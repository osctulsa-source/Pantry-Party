/**
 * Notification elements from the App Elements design kit — 1a and 1b — rebuilt
 * on the app's real BrandIcon glyphs.
 *
 *  - AppIconBadge (1a): a mock of the home-screen app icon carrying an unread
 *    count badge. The app icon never themes on the springboard, so it is drawn
 *    from brand CONSTANTS (brandPalette), NOT theme tokens — it looks identical
 *    in light and dark, exactly like the shipped icon.
 *  - BannerNotification (1b): an in-app notification banner. This lives inside
 *    the app UI, so it IS theme-aware (tokens) and adapts to light/dark.
 *
 * The handoff starter used hardcoded hexes; the ad-hoc text colors are mapped to
 * tokens here so the banner reads correctly in both schemes.
 */
import { StyleSheet, Text, View } from 'react-native';

import { BRAND_CREAM, BRAND_GROUNDS } from '../../theme/brandPalette';
import { tokens } from '../../theme/tokens';
import { BrandIcon, type BrandFoodName } from '../BrandIcon';

/** 1a — the app icon tile with an optional unread-count badge (brand-constant). */
export function AppIconBadge({ count }: { count: number }) {
  const label = count > 0 ? `${count} unread notification${count === 1 ? '' : 's'}` : 'No unread notifications';
  return (
    <View accessible accessibilityLabel={label}>
      <AppIconTile />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function AppIconTile() {
  return (
    <View
      style={styles.iconTile}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <BrandIcon name="bread" variant="onColor" size={34} />
    </View>
  );
}

/** 1b — an in-app notification banner: glyph tile + title/body (theme-aware). */
export function BannerNotification({
  food,
  title,
  body,
}: {
  food: BrandFoodName;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.banner} accessible accessibilityLabel={`${title}. ${body}`}>
      <View
        style={styles.bannerIcon}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <BrandIcon name={food} variant="onColor" size={22} />
      </View>
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // App icon (1a) — brand constants, never themed (mirrors the springboard icon).
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: BRAND_GROUNDS.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: BRAND_GROUNDS.brick,
    borderWidth: 2,
    borderColor: BRAND_CREAM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: BRAND_CREAM, fontFamily: tokens.font.body.semibold, fontSize: 11 },

  // Banner (1b) — in-app surface, theme-aware.
  banner: {
    flexDirection: 'row',
    gap: tokens.space(3),
    alignItems: 'center',
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space(3),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.line,
  },
  bannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: BRAND_GROUNDS.fern,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: { flexShrink: 1, gap: 2 },
  bannerTitle: { fontFamily: tokens.font.body.semibold, fontSize: 13, color: tokens.color.ink },
  bannerBody: { fontFamily: tokens.font.body.regular, fontSize: 12, color: tokens.color.inkMuted },
});

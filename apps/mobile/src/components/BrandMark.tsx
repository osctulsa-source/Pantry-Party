/**
 * BrandMark — the Breadbox logo: a bread loaf with a little leaf sprig.
 *
 * Two variants:
 *   - "icon" (default): the app-icon lockup — a rounded terracotta tile with a
 *     cream loaf. This is the form users see on their home screen.
 *   - "mark": the bare loaf in brand color (terracotta loaf, forest leaf) for
 *     placing on a light surface.
 *
 * Pure react-native-svg, all colors from theme tokens, so it re-skins with the
 * brand and adapts to light/dark. Decorative by default (hidden from assistive
 * tech); pass `label` to announce it (e.g. on a splash/auth hero).
 */
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { tokens } from '../theme/tokens';

// A single leaf, pointed at the top, drawn from its base at (0,0).
const LEAF = 'M0 0 C 6 -5 6 -17 0 -23 C -6 -17 -6 -5 0 0 Z';

export function BrandMark({
  size = 72,
  variant = 'icon',
  label,
}: {
  size?: number;
  variant?: 'icon' | 'mark';
  label?: string;
}) {
  const { secondary, accent, surface } = tokens.color;
  const isIcon = variant === 'icon';
  const loaf = isIcon ? surface : secondary; // loaf body
  const score = isIcon ? secondary : surface; // the slashed cuts
  return (
    <View
      pointerEvents="none"
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'auto' : 'no-hide-descendants'}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {isIcon && <Rect x={0} y={0} width={100} height={100} rx={24} fill={secondary} />}
        <Path d="M24 73 L24 53 Q24 29 50 29 Q76 29 76 53 L76 73 Z" fill={loaf} />
        <Path d="M41 49 l7 -10" stroke={score} strokeWidth={3.4} strokeLinecap="round" fill="none" />
        <Path d="M55 49 l7 -10" stroke={score} strokeWidth={3.4} strokeLinecap="round" fill="none" />
        <Path d={LEAF} transform="translate(50,31) scale(0.7)" fill={accent} />
      </Svg>
    </View>
  );
}

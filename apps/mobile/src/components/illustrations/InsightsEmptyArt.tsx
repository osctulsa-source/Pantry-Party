/**
 * InsightsEmptyArt — illustration for the Insights screen's "Your story starts
 * here" empty state. Three ascending bars with a little spark: progress, a
 * story beginning, momentum. Part of the Delight D3 empty-state family — same
 * soft halo + token palette as the others.
 *
 * Pure react-native-svg (already a dep), all colors from theme tokens: accent
 * bars + baseline, terracotta `secondary` spark, `accentSoft` halo. Adapts to
 * light/dark for free. Decorative — hidden from assistive tech; the title +
 * subcopy carry the meaning.
 */
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { tokens } from '../../theme/tokens';

export function InsightsEmptyArt({ size = 132 }: { size?: number }) {
  const { accent, secondary, accentSoft } = tokens.color;
  return (
    <View
      style={{ marginBottom: tokens.space(6) }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Circle cx={60} cy={60} r={52} fill={accentSoft} />

        {/* Baseline. */}
        <Path d="M35 90 L85 90" stroke={accent} strokeWidth={2} strokeLinecap="round" opacity={0.3} />

        {/* Ascending bars. */}
        <Rect x={37} y={76} width={12} height={14} rx={4} fill={accent} />
        <Rect x={54} y={64} width={12} height={26} rx={4} fill={accent} />
        <Rect x={71} y={50} width={12} height={40} rx={4} fill={accent} />

        {/* A spark above the tallest bar. */}
        <Path
          d="M84 38 L85.8 42.2 L90 44 L85.8 45.8 L84 50 L82.2 45.8 L78 44 L82.2 42.2 Z"
          fill={secondary}
        />
      </Svg>
    </View>
  );
}

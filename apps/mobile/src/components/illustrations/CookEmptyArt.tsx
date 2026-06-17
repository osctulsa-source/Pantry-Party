/**
 * CookEmptyArt — illustration for the Cook tab's empty state ("Your pantry is
 * the menu", plus the all-excluded / no-match variants). A two-tone cooking pot
 * with a terracotta lid and rising steam. Part of the Delight D3 empty-state
 * family — same soft halo + token palette as the others.
 *
 * Pure react-native-svg (already a dep), all colors from theme tokens: accent
 * pot body + handles + knob, terracotta `secondary` lid, `accentSoft` halo,
 * accent steam at low opacity. Adapts to light/dark for free. Decorative —
 * hidden from assistive tech; the title + helper line carry the meaning.
 */
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { tokens } from '../../theme/tokens';

export function CookEmptyArt({ size = 132 }: { size?: number }) {
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

        {/* Steam. */}
        <Path
          d="M53 50 q -4 -4 0 -8 q 4 -4 0 -8"
          stroke={accent}
          strokeWidth={2.6}
          strokeLinecap="round"
          fill="none"
          opacity={0.5}
        />
        <Path
          d="M67 50 q -4 -4 0 -8 q 4 -4 0 -8"
          stroke={accent}
          strokeWidth={2.6}
          strokeLinecap="round"
          fill="none"
          opacity={0.5}
        />

        {/* Side handles. */}
        <Path d="M42 80 C 33 80, 33 92, 42 92" stroke={accent} strokeWidth={4} strokeLinecap="round" fill="none" />
        <Path d="M78 80 C 87 80, 87 92, 78 92" stroke={accent} strokeWidth={4} strokeLinecap="round" fill="none" />

        {/* Pot body (wide cylinder, flat-ish bottom). */}
        <Path d="M42 73 L78 73 L78 92 Q78 99 71 99 L49 99 Q42 99 42 92 Z" fill={accent} />

        {/* Lid: terracotta rim overhang + dome + accent knob. */}
        <Rect x={38} y={66} width={44} height={7} rx={3.5} fill={secondary} />
        <Path d="M47 66 Q60 56 73 66 Z" fill={secondary} />
        <Circle cx={60} cy={56} r={3.4} fill={accent} />
      </Svg>
    </View>
  );
}

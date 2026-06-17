/**
 * ShoppingEmptyArt — illustration for the Shopping tab's "All stocked up" empty
 * state. A grocery bag with a check badge: nothing to buy right now, you're
 * set. Part of the Delight D3 empty-state family — same soft halo + token
 * palette as PantryEmptyArt.
 *
 * Pure react-native-svg (already a dep), all colors from theme tokens:
 * terracotta `secondary` bag, forest `accent` handles + badge, `accentSoft`
 * halo, `surface` knockout ring + fold, `onAccent` check. Adapts to light/dark
 * for free. Decorative — hidden from assistive tech; title + subcopy carry the
 * meaning.
 */
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { tokens } from '../../theme/tokens';

export function ShoppingEmptyArt({ size = 132 }: { size?: number }) {
  const { accent, secondary, accentSoft, surface, onAccent } = tokens.color;
  return (
    <View
      style={{ marginBottom: tokens.space(6) }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Circle cx={60} cy={60} r={52} fill={accentSoft} />

        {/* Handles. */}
        <Path
          d="M49 58 C 49 47, 59 47, 59 58"
          stroke={accent}
          strokeWidth={3.4}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M61 58 C 61 47, 71 47, 71 58"
          stroke={accent}
          strokeWidth={3.4}
          strokeLinecap="round"
          fill="none"
        />

        {/* Bag body + a fold line at the opening. */}
        <Path d="M45 57 L75 57 L73 99 Q73 101 71 101 L49 101 Q47 101 47 99 Z" fill={secondary} />
        <Path d="M45 65 L75 65" stroke={surface} strokeWidth={2} strokeLinecap="round" opacity={0.5} />

        {/* "Done" badge: knockout ring + accent disc + check. */}
        <Circle cx={72} cy={88} r={13} fill={surface} />
        <Circle cx={72} cy={88} r={10.5} fill={accent} />
        <Path
          d="M67 88 l3.2 3.4 l6 -7"
          stroke={onAccent}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

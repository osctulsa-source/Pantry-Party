/**
 * CookErrorArt — illustration for the Cook tab's "Couldn't load recipes" error
 * state. A cloud with an alert badge — a friendly "couldn't reach the recipes,
 * try again" (the error detail + retry sit below it). Part of the Delight D3
 * empty-state family; the alert badge mirrors the shopping done-badge motif.
 *
 * Pure react-native-svg, all colors from theme tokens (accent cloud, terracotta
 * `secondary` badge, `surface` knockout ring, `onAccent` glyph, `accentSoft`
 * halo). Adapts to light/dark for free. Decorative — hidden from assistive
 * tech; the title + message carry the meaning.
 */
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { tokens } from '../../theme/tokens';

export function CookErrorArt({ size = 120 }: { size?: number }) {
  const { accent, secondary, accentSoft, surface, onAccent } = tokens.color;
  return (
    <View
      style={{ marginBottom: tokens.space(5) }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Circle cx={60} cy={60} r={52} fill={accentSoft} />

        {/* Cloud: base + three lumps. */}
        <Rect x={34} y={72} width={48} height={16} rx={8} fill={accent} />
        <Circle cx={46} cy={71} r={11} fill={accent} />
        <Circle cx={60} cy={62} r={15} fill={accent} />
        <Circle cx={74} cy={71} r={11} fill={accent} />

        {/* Alert badge: knockout ring + disc + "!". */}
        <Circle cx={80} cy={84} r={13} fill={surface} />
        <Circle cx={80} cy={84} r={10.5} fill={secondary} />
        <Path d="M80 79 L80 85" stroke={onAccent} strokeWidth={2.6} strokeLinecap="round" />
        <Circle cx={80} cy={89} r={1.6} fill={onAccent} />
      </Svg>
    </View>
  );
}

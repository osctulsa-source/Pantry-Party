/**
 * PantryEmptyArt — the illustration above the empty-pantry "Fresh start" state.
 *
 * A sprout rising from a terracotta pot: new beginning, growth, warmth — the
 * feeling we want when someone opens a pantry they haven't filled yet. It's the
 * first of the Delight D3 empty-state illustrations; siblings (shopping, cook,
 * insights) follow this same pattern — a single contained mark on a soft halo.
 *
 * Pure react-native-svg (already a dependency — no new deps, no rebuild), drawn
 * entirely from theme tokens so it re-skins with the brand and adapts to
 * light/dark automatically: terracotta `secondary` pot, forest `accent` sprout,
 * soft `accentSoft` halo. Decorative — hidden from assistive tech, since the
 * surrounding title and subcopy already carry the meaning.
 */
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { tokens } from '../../theme/tokens';

// One leaf, pointed at the top, drawn from its base at (0,0). The three are
// placed + rotated by their own transforms so they fan out from the stem.
const LEAF = 'M0 0 C 6 -5 6 -17 0 -23 C -6 -17 -6 -5 0 0 Z';

export function PantryEmptyArt({ size = 132 }: { size?: number }) {
  const { accent, secondary, accentSoft } = tokens.color;
  return (
    <View
      style={{ marginBottom: tokens.space(6) }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 120 120">
        {/* Soft halo — keeps the mark contained and readable on any surface. */}
        <Circle cx={60} cy={60} r={52} fill={accentSoft} />

        {/* Sprout: stem + a three-leaf fan. */}
        <Path
          d="M60 80 C 59 70, 60 62, 60 52"
          stroke={accent}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
        />
        <Path d={LEAF} fill={accent} transform="translate(60, 51) scale(0.85)" />
        <Path d={LEAF} fill={accent} transform="translate(54, 57) rotate(-42)" />
        <Path d={LEAF} fill={accent} transform="translate(66, 55) rotate(42)" />

        {/* Terracotta pot: rim + tapered body. */}
        <Rect x={41} y={74} width={38} height={9} rx={3} fill={secondary} />
        <Path
          d="M45 83 L75 83 L71 105 Q71 107 69 107 L51 107 Q49 107 49 105 Z"
          fill={secondary}
        />

        {/* A couple of fresh little specks. */}
        <Circle cx={34} cy={60} r={2.5} fill={secondary} />
        <Circle cx={87} cy={62} r={2} fill={secondary} />
      </Svg>
    </View>
  );
}

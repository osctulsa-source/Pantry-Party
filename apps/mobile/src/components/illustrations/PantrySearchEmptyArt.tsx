/**
 * PantrySearchEmptyArt — illustration for the Pantry tab's "No matches"
 * search-empty state (a search that returned nothing, vs. an empty pantry).
 * A magnifying glass with a faint dash inside — "looked, nothing here." Part of
 * the Delight D3 empty-state family — same soft halo + token palette.
 *
 * Pure react-native-svg, all colors from theme tokens (accent lens rim +
 * handle, `surface` glass, `accentSoft` halo). Adapts to light/dark for free.
 * Decorative — hidden from assistive tech; the title + subcopy carry meaning.
 */
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { tokens } from '../../theme/tokens';

export function PantrySearchEmptyArt({ size = 120 }: { size?: number }) {
  const { accent, accentSoft, surface } = tokens.color;
  return (
    <View
      style={{ marginBottom: tokens.space(5) }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Circle cx={60} cy={60} r={52} fill={accentSoft} />

        {/* Handle (drawn first, so the lens sits on top of it). */}
        <Path d="M68 67 L83 82" stroke={accent} strokeWidth={7} strokeLinecap="round" />

        {/* Lens + a faint "nothing here" dash. */}
        <Circle cx={55} cy={54} r={17} fill={surface} stroke={accent} strokeWidth={5} />
        <Path d="M49 54 L61 54" stroke={accent} strokeWidth={3} strokeLinecap="round" opacity={0.35} />
      </Svg>
    </View>
  );
}

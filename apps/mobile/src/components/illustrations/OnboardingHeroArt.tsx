/**
 * OnboardingHeroArt — the welcome hero above "Let's stock your pantry" on the
 * first-run OnboardingScreen. A warm pantry shelf: a mason jar, a bread loaf (a
 * wink at the "Breadbox" codename), and an apple. Sets the tone before the
 * QuickAddStaples picker below.
 *
 * Same illustration family as the empty-state art — soft `accentSoft` field,
 * forest `accent` + terracotta `secondary` palette, all from theme tokens, so
 * it adapts to light/dark for free. Landscape hero (4:3 viewBox); width prop
 * drives the size, height follows. Decorative — hidden from assistive tech, as
 * the title + hint carry the meaning.
 */
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { tokens } from '../../theme/tokens';

export function OnboardingHeroArt({ width = 220 }: { width?: number }) {
  const { accent, secondary, accentSoft, surface } = tokens.color;
  const height = Math.round((width * 150) / 200);
  return (
    <View
      style={{ alignItems: 'center', marginBottom: tokens.space(5) }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg width={width} height={height} viewBox="0 0 200 150">
        {/* Soft field. */}
        <Rect x={6} y={8} width={188} height={134} rx={26} fill={accentSoft} />

        {/* Shelf. */}
        <Rect x={28} y={105} width={144} height={9} rx={4} fill={secondary} />

        {/* Mason jar: body + lid + glass band. */}
        <Rect x={47} y={64} width={30} height={41} rx={8} fill={accent} />
        <Rect x={45} y={56} width={34} height={9} rx={3} fill={secondary} />
        <Path d="M47 80 L77 80" stroke={surface} strokeWidth={2} strokeLinecap="round" opacity={0.45} />

        {/* Bread loaf + score marks. */}
        <Path d="M93 105 L93 92 Q93 78 113 78 Q133 78 133 92 L133 105 Z" fill={secondary} />
        <Path d="M104 86 l4 -5" stroke={surface} strokeWidth={2} strokeLinecap="round" opacity={0.5} />
        <Path d="M114 86 l4 -5" stroke={surface} strokeWidth={2} strokeLinecap="round" opacity={0.5} />

        {/* Apple + leaf. */}
        <Circle cx={153} cy={91} r={14} fill={accent} />
        <Path d="M153 79 q 7 -6 11 -2 q -3 7 -11 4 Z" fill={secondary} />

        {/* A couple of fresh specks. */}
        <Circle cx={34} cy={40} r={2.5} fill={secondary} />
        <Circle cx={170} cy={44} r={2} fill={accent} />
      </Svg>
    </View>
  );
}

/**
 * collectionIcons — hand-drawn react-native-svg glyphs for the Collections
 * screen, one per foodKinds set plus the "Undiscovered" mystery reveals.
 *
 * Two states in one component: `collected` paints the food in its own warm,
 * muted Crumb-adjacent hues; otherwise it renders as a clean ghost outline
 * (fills dropped, strokes → inkMuted) — the exact chip metaphor as an emblem.
 * Detail marks (seeds, holes, grains) only draw when collected.
 *
 * Pure react-native-svg (already a dep); food hues are decorative literals,
 * the ghost tone comes from theme tokens so lock state adapts to light/dark.
 * Decorative — callers hide it from assistive tech; the set title carries
 * the meaning. Animation lives in the screen (built-in Animated), not here.
 */
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { tokens } from '../../theme/tokens';

export interface GlyphProps {
  collected?: boolean;
  size?: number;
}

/** Draw a single glyph by food key (also serves the mystery reveals). */
export function CollectionGlyph({
  name,
  collected = false,
  size = 44,
}: GlyphProps & { name: string }) {
  const ghost = tokens.color.inkMuted;
  // body/leaf paint: real colors when collected, ghost outline when locked.
  const b = (fill: string, stroke: string) =>
    collected ? { fill, stroke } : { fill: 'none' as const, stroke: ghost };
  const seedFill = collected ? tokens.color.surface : 'none';
  const detail = collected;

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <G strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {glyph(name, b, ghost, seedFill, detail)}
      </G>
    </Svg>
  );
}

type Paint = (fill: string, stroke: string) => { fill: string; stroke: string };

function glyph(name: string, b: Paint, ghost: string, seed: string, detail: boolean) {
  switch (name) {
    case 'grapes':
      return (
        <>
          <Path {...b('none', ghost)} d="M24 15 V9" stroke={detail ? '#4E7A45' : ghost} />
          <Path {...b('#5E9455', '#4E7A45')} d="M25 10 Q33 5 37 9 Q31 13 25 10 Z" />
          {[[24, 18], [18.5, 25], [29.5, 25], [24, 26], [21, 32], [27, 32], [24, 38]].map(([x, y], i) => (
            <Circle key={i} {...b('#7E5A9E', '#5A3E77')} cx={x} cy={y} r={5} />
          ))}
        </>
      );
    case 'apples':
      return (
        <>
          <Path {...b('none', ghost)} d="M24 16 Q25 10 29 8" stroke={detail ? '#8E3A2E' : ghost} />
          <Path {...b('#5E9455', '#4E7A45')} d="M25 11 Q33 6 37 11 Q31 15 25 11 Z" />
          <Circle {...b('#C55B4B', '#8E3A2E')} cx={19} cy={28} r={10} />
          <Circle {...b('#C55B4B', '#8E3A2E')} cx={29} cy={28} r={10} />
        </>
      );
    case 'peppers':
      return (
        <>
          <Path {...b('none', ghost)} d="M24 15 Q24 9 28 8" stroke={detail ? '#3D6A33' : ghost} />
          <Circle {...b('#5E8F4E', '#3D6A33')} cx={18} cy={31} r={8} />
          <Circle {...b('#5E8F4E', '#3D6A33')} cx={30} cy={31} r={8} />
          <Circle {...b('#5E8F4E', '#3D6A33')} cx={24} cy={27} r={9} />
        </>
      );
    case 'tomatoes':
      return (
        <>
          <Circle {...b('#CF5B45', '#97382A')} cx={24} cy={29} r={12} />
          <Path {...b('#5E9455', '#4E7A45')} d="M24 22 L24 12 L27 18 Z" />
          <Path {...b('#5E9455', '#4E7A45')} d="M24 22 L17 15 L20 21 Z" />
          <Path {...b('#5E9455', '#4E7A45')} d="M24 22 L31 15 L28 21 Z" />
        </>
      );
    case 'cheese':
      return (
        <>
          <Path {...b('#E0B85A', '#B08A2E')} d="M11 31 L34 19 Q37 18 37 22 L37 30 Q37 32 34 31 Z" />
          {detail && (
            <>
              <Circle fill={tokens.color.surface} cx={26} cy={26} r={1.8} />
              <Circle fill={tokens.color.surface} cx={20} cy={29} r={1.3} />
              <Circle fill={tokens.color.surface} cx={31} cy={27.5} r={1.1} />
            </>
          )}
        </>
      );
    case 'eggs':
      return (
        <>
          <Path {...b('#EFE6CF', '#C6B389')} d="M24 12 C31 12 34 24 34 30 A10 10 0 0 1 14 30 C14 24 17 12 24 12 Z" />
          {detail && <Path fill="none" stroke="#D8CBA6" d="M20 30 a4 4 0 0 0 6 3" />}
        </>
      );
    case 'milk':
      return (
        <>
          <Path {...b('#F0EAD8', '#C9BFA0')} d="M20 14 h8 v4 l3 5 v15 a2 2 0 0 1 -2 2 h-10 a2 2 0 0 1 -2 -2 v-15 l3 -5 Z" />
          <Path {...b('#DDE7D6', '#C9BFA0')} d="M17 27 h14 v6 h-14 Z" />
        </>
      );
    case 'flour': // wheat sheaf
      return (
        <>
          <Path {...b('none', ghost)} d="M24 42 V18" stroke={detail ? '#96722A' : ghost} />
          <Ellipse {...b('#C89B45', '#96722A')} cx={24} cy={14} rx={2.6} ry={5} />
          <Ellipse {...b('#C89B45', '#96722A')} cx={19} cy={19} rx={2.4} ry={4.6} />
          <Ellipse {...b('#C89B45', '#96722A')} cx={29} cy={19} rx={2.4} ry={4.6} />
          <Ellipse {...b('#C89B45', '#96722A')} cx={19.5} cy={26} rx={2.4} ry={4.6} />
          <Ellipse {...b('#C89B45', '#96722A')} cx={28.5} cy={26} rx={2.4} ry={4.6} />
        </>
      );
    case 'bread':
      return (
        <>
          <Path {...b('#C9A063', '#97722A')} d="M9 31 Q9 20 24 20 Q39 20 39 31 Q39 34 35 34 L13 34 Q9 34 9 31 Z" />
          {detail && (
            <>
              <Path fill="none" stroke="#97722A" d="M18 26 l4 -4" />
              <Path fill="none" stroke="#97722A" d="M24 27 l4 -4" />
            </>
          )}
        </>
      );
    case 'pasta': // bowl of noodles
      return (
        <>
          <Path {...b('none', detail ? '#B0862F' : ghost)} d="M15 22 Q19 15 23 22 T31 22" />
          <Path {...b('none', detail ? '#B0862F' : ghost)} d="M17 25 Q21 18 25 25 T33 25" />
          <Path {...b('#D8B36A', '#A8842E')} d="M11 27 Q24 40 37 27 Z" />
        </>
      );
    case 'rice': // bowl with grains
      return (
        <>
          {detail && [[20, 23], [24, 21], [28, 23], [22, 25], [26, 25]].map(([x, y], i) => (
            <Ellipse key={i} fill={tokens.color.surface} cx={x} cy={y} rx={1.6} ry={2.6} />
          ))}
          <Path {...b('#CBBE9E', '#9B8D6B')} d="M11 27 Q24 40 37 27 Z" />
        </>
      );
    case 'beans':
      return (
        <>
          <Path {...b('#8B5E3C', '#5E3E24')} d="M17 30 Q12 26 16 21 Q21 23 19 27 Q22 30 17 30 Z" />
          <Path {...b('#8B5E3C', '#5E3E24')} d="M27 32 Q22 28 26 23 Q31 25 29 29 Q32 32 27 32 Z" />
          <Path {...b('#A06E45', '#5E3E24')} d="M32 24 Q28 21 31 17 Q35 19 33 22 Q36 24 32 24 Z" />
        </>
      );
    case 'yogurt': // cup
      return (
        <>
          <Path {...b('#EFE7D3', '#C6B389')} d="M16 22 L32 22 L30 40 L18 40 Z" />
          <Path {...b('none', detail ? '#C6B389' : ghost)} d="M14 22 H34" />
          {detail && <Circle fill="#C0413F" cx={24} cy={30} r={2.4} />}
        </>
      );
    case 'oil': // bottle
      return (
        <>
          <Path {...b('#B7A23E', '#897922')} d="M20 15 h8 v4 l3 5 v15 a2 2 0 0 1 -2 2 h-10 a2 2 0 0 1 -2 -2 v-15 l3 -5 Z" />
          <Path {...b('#6BA362', '#4E7A45')} d="M24 15 V11 q4 0 4 -3" />
        </>
      );
    case 'butter':
      return (
        <>
          <Path {...b('#EAC96B', '#B89A38')} d="M11 27 L31 20 L37 24 L17 31 Z" />
          <Path {...b('#E0BC58', '#B89A38')} d="M11 27 L17 31 L17 36 L11 32 Z" />
          <Path {...b('#EAC96B', '#B89A38')} d="M17 31 L37 24 L37 29 L17 36 Z" />
        </>
      );
    case 'chicken': // drumstick
      return (
        <>
          <Circle {...b('#CD9A62', '#9A6E34')} cx={20} cy={21} r={9} />
          <Path {...b('none', detail ? '#9A6E34' : ghost)} d="M25 27 L32 35" />
          <Circle {...b('#EFE6CF', '#C6B389')} cx={33} cy={35} r={3} />
          <Circle {...b('#EFE6CF', '#C6B389')} cx={35} cy={31} r={3} />
        </>
      );
    case 'coffee': // mug
      return (
        <>
          {detail && (
            <>
              <Path fill="none" stroke={ghost} strokeOpacity={0.5} d="M18 15 q2 -3 0 -6" />
              <Path fill="none" stroke={ghost} strokeOpacity={0.5} d="M24 15 q2 -3 0 -6" />
            </>
          )}
          <Path {...b('#C7935B', '#8A5E2E')} d="M14 20 h16 v12 a6 6 0 0 1 -6 6 h-4 a6 6 0 0 1 -6 -6 Z" />
          <Path {...b('none', detail ? '#8A5E2E' : ghost)} d="M30 23 q6 0 6 5 t -6 5" />
        </>
      );
    case 'tea': // cup + saucer
      return (
        <>
          {detail && <Path fill="none" stroke={ghost} strokeOpacity={0.5} d="M22 16 q2 -3 0 -6" />}
          <Path {...b('#E7DFC9', '#C6B389')} d="M15 23 h14 v6 a5 5 0 0 1 -5 5 h-4 a5 5 0 0 1 -5 -5 Z" />
          <Path {...b('none', detail ? '#C6B389' : ghost)} d="M29 25 q5 0 5 4 t -5 4" />
          <Ellipse {...b('#E7DFC9', '#C6B389')} cx={24} cy={38} rx={11} ry={2.6} />
        </>
      );
    case 'juice': // glass with straw
      return (
        <>
          <Path {...b('none', detail ? '#A8842E' : ghost)} d="M28 14 L24 24" />
          {detail && <Path fill="#E39A3C" d="M18.5 24 H29.5 L28 40 H20 Z" />}
          <Path {...b('none', detail ? '#8A6E30' : ghost)} d="M17 18 H31 L29 40 H19 Z" />
        </>
      );
    case 'salsa': // bowl of salsa
      return (
        <>
          {detail && (
            <>
              <Circle fill="#7C9B3E" cx={21} cy={30} r={1.5} />
              <Circle fill="#E7C24A" cx={27} cy={31} r={1.4} />
              <Circle fill="#A83A2C" cx={24} cy={33} r={1.5} />
            </>
          )}
          <Path {...b('#C24A3C', '#8E3228')} d="M11 28 Q24 40 37 28 Z" />
          <Path {...b('none', detail ? '#8E3228' : ghost)} d="M10 27 H38" />
        </>
      );

    /* ---- mystery reveals + extras ---- */
    case 'avocado':
      return (
        <>
          <Path {...b('#7FA65C', '#557E3C')} d="M24 11 C31 11 31 21 29 28 A7 8 0 0 1 19 28 C17 21 17 11 24 11 Z" />
          <Circle {...b('#9B6B44', '#7A5231')} cx={24} cy={27} r={4.6} />
        </>
      );
    case 'pineapple':
      return (
        <>
          <Path {...b('#5E9455', '#4E7A45')} d="M24 17 L24 6 L27 12 Z" />
          <Path {...b('#5E9455', '#4E7A45')} d="M24 17 L18 8 L20 13 Z" />
          <Path {...b('#5E9455', '#4E7A45')} d="M24 17 L30 8 L28 13 Z" />
          <Path {...b('#D8A63F', '#A87E22')} d="M24 16 C31 16 32 25 31 33 Q30 41 24 41 Q18 41 17 33 C16 25 17 16 24 16 Z" />
          {detail && (
            <>
              <Path fill="none" stroke="#A87E22" d="M18 24 l12 6" />
              <Path fill="none" stroke="#A87E22" d="M30 24 l-12 6" />
            </>
          )}
        </>
      );
    case 'mushroom':
      return (
        <>
          <Path {...b('#EFE6CF', '#C6B389')} d="M20 29 Q20 38 22 40 h4 Q28 38 28 29 Z" />
          <Path {...b('#C0654B', '#8E3A2E')} d="M11 26 Q11 15 24 15 Q37 15 37 26 Q30 29 24 29 Q18 29 11 26 Z" />
          {detail && (
            <>
              <Circle fill={tokens.color.surface} cx={20} cy={21} r={1.6} />
              <Circle fill={tokens.color.surface} cx={28} cy={22} r={1.3} />
              <Circle fill={tokens.color.surface} cx={24} cy={19} r={1.1} />
            </>
          )}
        </>
      );
    case 'chili':
      return (
        <>
          <Path {...b('none', detail ? '#4E7A45' : ghost)} d="M23 16 Q21 10 25 8" />
          <Path {...b('#C13B34', '#8E2A25')} d="M20 15 Q23 28 32 37 Q36 33 31 27 Q25 21 24 14 Z" />
        </>
      );
    case 'carrot':
      return (
        <>
          <Path {...b('#CE7A3C', '#9A5322')} d="M24 41 L18 19 Q24 16 30 19 Z" />
          <Path {...b('none', detail ? '#4E7A45' : ghost)} d="M24 19 V10 M24 15 L18 9 M24 15 L30 9" />
        </>
      );
    case 'strawberry':
      return (
        <>
          <Path {...b('#CB4E52', '#8E3034')} d="M24 41 C13 34 12 24 24 20 C36 24 35 34 24 41 Z" />
          <Path {...b('#5E9455', '#4E7A45')} d="M16 20 Q24 13 32 20 Q24 17 16 20 Z" />
          {detail && [[21, 28], [27, 28], [24, 31], [20, 33], [28, 33], [24, 36]].map(([x, y], i) => (
            <Circle key={i} fill="#F3E7BD" cx={x} cy={y} r={1} />
          ))}
        </>
      );
    case 'sprout':
      return (
        <>
          <Path {...b('#9B6B44', '#7A5231')} d="M14 35 Q24 31 34 35 L32 41 Q24 44 16 41 Z" />
          <Path {...b('none', detail ? '#4E7A45' : ghost)} d="M24 35 V21" />
          <Path {...b('#5E9455', '#4E7A45')} d="M24 28 Q13 26 12 16 Q23 17 24 28 Z" />
          <Path {...b('#6BA362', '#4E7A45')} d="M24 25 Q35 23 37 13 Q25 14 24 25 Z" />
        </>
      );
    case 'lemon':
      return (
        <>
          <Path {...b('#5E9455', '#4E7A45')} d="M13 19 Q6 15 3 20 Q9 24 15 20 Z" />
          <Ellipse {...b('#D7AC46', '#A67E22')} cx={25} cy={28} rx={13} ry={10} />
        </>
      );
    default:
      // Generic "jar" so an unmapped set still reads as collectible.
      return (
        <>
          <Path {...b('#DDE7D6', '#4E7A45')} d="M16 20 h16 v18 a2 2 0 0 1 -2 2 h-12 a2 2 0 0 1 -2 -2 Z" />
          <Path {...b('none', detail ? '#4E7A45' : ghost)} d="M15 20 h18 v-3 h-18 Z" />
        </>
      );
  }
}

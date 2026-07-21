/**
 * Motion helpers — thin wrappers. Kit glyphs (plate/flame/receipt/fridge) live
 * in brandGlyphs.micro and render via BrandIcon; keep sprout/sparkle/heart here
 * for pull-to-refresh and favorite motion.
 */
import Svg, { G, Path } from 'react-native-svg';

import { BRAND_CREAM, BRAND_LEAF, toneHex, type BrandTone } from '../theme/brandPalette';
import type { Paint } from '../components/brandGlyphs.core';
import { MICRO_GLYPHS } from '../components/brandGlyphs.micro';
import { CORE_GLYPHS } from '../components/brandGlyphs.core';

export type MotionPaint = Paint;

export function motionPaint(tone: BrandTone = 'fern', variant: 'onColor' | 'onLight' = 'onLight'): Paint {
  const ground = toneHex(tone);
  return variant === 'onColor'
    ? { body: BRAND_CREAM, cut: ground, leaf: BRAND_LEAF }
    : { body: ground, cut: BRAND_CREAM, leaf: BRAND_LEAF };
}

function MicroIcon({
  name,
  paint,
  size = 48,
}: {
  name: keyof typeof MICRO_GLYPHS;
  paint: Paint;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <G strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        {MICRO_GLYPHS[name](paint)}
      </G>
    </Svg>
  );
}

export function FlameGlyph({ paint, size = 48 }: { paint: Paint; size?: number }) {
  return <MicroIcon name="flame" paint={paint} size={size} />;
}

export function FridgeGlyph({ paint, size = 48 }: { paint: Paint; size?: number }) {
  return <MicroIcon name="fridge" paint={paint} size={size} />;
}

export function ReceiptGlyph({ paint, size = 48 }: { paint: Paint; size?: number }) {
  return <MicroIcon name="receipt" paint={paint} size={size} />;
}

export function HeartGlyph({
  paint,
  size = 48,
  filled = true,
}: {
  paint: Paint;
  size?: number;
  filled?: boolean;
}) {
  const { body, leaf } = paint;
  const d =
    'M24 38 C18 33 12 28 12 21 C12 16 15.5 13 19.5 13 C22 13 23.5 14.5 24 16 C24.5 14.5 26 13 28.5 13 C32.5 13 36 16 36 21 C36 28 30 33 24 38 Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <G strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <Path d={d} fill={filled ? body : 'transparent'} stroke={filled ? body : leaf} />
      </G>
    </Svg>
  );
}

export function SparkleGlyph({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path d="M8 1 L9.5 6.5 L15 8 L9.5 9.5 L8 15 L6.5 9.5 L1 8 L6.5 6.5 Z" fill={color} />
    </Svg>
  );
}

/** Herb leaf paths reused for the pull-to-refresh sprout. */
export function SproutGlyph({
  paint,
  size = 48,
  stemProgress = 1,
  leftLeaf = 1,
  rightLeaf = 1,
}: {
  paint: Paint;
  size?: number;
  stemProgress?: number;
  leftLeaf?: number;
  rightLeaf?: number;
}) {
  const { leaf } = paint;
  const stemLen = 22 * stemProgress;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <G strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <Path
          d={`M24 40 V${40 - stemLen}`}
          fill="none"
          stroke={leaf}
          opacity={stemProgress > 0.05 ? 1 : 0}
        />
        <G opacity={leftLeaf} transform={`translate(24, ${40 - stemLen + 12}) scale(${leftLeaf})`}>
          <Path d="M0 0 C-7 -2 -9 -9 -9 -9 C-3 -9 0 -4 0 0 Z" fill={leaf} />
        </G>
        <G opacity={rightLeaf} transform={`translate(24, ${40 - stemLen + 8}) scale(${rightLeaf})`}>
          <Path d="M0 0 C7 -2 9 -9 9 -9 C3 -9 0 -4 0 0 Z" fill={leaf} />
        </G>
      </G>
    </Svg>
  );
}

export function BreadGlyph({ paint, size = 48 }: { paint: Paint; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <G strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        {CORE_GLYPHS.bread(paint)}
      </G>
    </Svg>
  );
}

export { CORE_GLYPHS };

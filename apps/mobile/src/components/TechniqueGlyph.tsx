/**
 * TechniqueGlyph — renders one animated technique/stage glyph for Cook Mode.
 *
 * The glyph's static base is one Svg; each animatable layer is its OWN
 * absolutely-positioned Svg inside an Animated.View, so every loop runs
 * transform/opacity on the NATIVE driver (animating svg props directly would
 * stay on the JS thread). One 0→1 progress value per glyph drives all layers
 * via interpolation from the declarative keyframes in techniqueMotion.
 *
 * Decorative: hidden from assistive tech (the step text carries meaning) —
 * same posture as BrandIcon. Honors OS reduce-motion by never starting the
 * loop: progress stays 0, which every spec defines as the rest pose.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { G } from 'react-native-svg';

import { TECHNIQUE_GLYPHS, type TechniqueGlyphName } from './brandGlyphs.technique';
import { TECHNIQUE_MOTION, type LayerMotion, type MotionKeyframe } from './techniqueMotion';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (live) setReduced(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

type NumericKey = 'translateX' | 'translateY' | 'scaleX' | 'scaleY' | 'opacity';

/**
 * Build the Animated style for one layer. Keyframe translations are in
 * 48-box glyph units; `unit` (= renderedSize / 48) scales them to points.
 */
function layerStyle(
  progress: Animated.Value,
  motion: LayerMotion,
  unit: number,
): Animated.WithAnimatedObject<ViewStyle> {
  const kfs = motion.keyframes;
  const inputRange = kfs.map((k) => k.at);
  // Property presence is determined from the first keyframe (contract:
  // every keyframe in a layer defines the same property set, enforced by
  // techniqueMotion.test.ts — kfs is never empty).
  const first = kfs[0]!;
  const has = (key: keyof MotionKeyframe) => first[key] !== undefined;
  const num = (key: NumericKey, scale = 1) =>
    progress.interpolate({ inputRange, outputRange: kfs.map((k) => (k[key] as number) * scale) });

  const transform: Animated.WithAnimatedArray<object> = [];
  if (has('translateX')) transform.push({ translateX: num('translateX', unit) });
  if (has('translateY')) transform.push({ translateY: num('translateY', unit) });
  if (has('rotate'))
    transform.push({
      rotate: progress.interpolate({ inputRange, outputRange: kfs.map((k) => `${k.rotate}deg`) }),
    });
  if (has('scaleX')) transform.push({ scaleX: num('scaleX') });
  if (has('scaleY')) transform.push({ scaleY: num('scaleY') });

  return {
    // `transform` is built as a loose array of single-key transform objects
    // above; RN's ViewStyle transform union is exact-shaped per entry, so
    // bridge the two here rather than typing the builder against that union.
    transform: transform as ViewStyle['transform'],
    ...(has('opacity') ? { opacity: num('opacity') } : null),
  };
}

export function TechniqueGlyph({ name, size = 96 }: { name: TechniqueGlyphName; size?: number }) {
  const def = TECHNIQUE_GLYPHS[name];
  const spec = TECHNIQUE_MOTION[name];
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  const shouldAnimate = !reduced && def.layers.length > 0;
  useEffect(() => {
    progress.setValue(0);
    if (!shouldAnimate) return;
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: spec.durationMs,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shouldAnimate, name, progress, spec.durationMs]);

  const unit = size / 48;
  return (
    <View
      style={{ width: size, height: size }}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <G strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          {def.base()}
        </G>
      </Svg>
      {def.layers.map((layer) => {
        const motion = spec.layers[layer.id];
        return (
          <Animated.View
            key={layer.id}
            style={[
              StyleSheet.absoluteFill,
              motion?.origin ? { transformOrigin: motion.origin } : null,
              motion ? layerStyle(progress, motion, unit) : null,
            ]}
          >
            <Svg width={size} height={size} viewBox="0 0 48 48">
              <G strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                {layer.node()}
              </G>
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

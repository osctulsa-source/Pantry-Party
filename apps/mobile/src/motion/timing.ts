/**
 * Motion kit timing — matched to design_handoff_micro_animations
 * (Micro-Animations Kit.dc.html + README).
 */
import { Easing } from 'react-native-reanimated';

export const MOTION = {
  /** Cooked It celebration (food → plate + sparkles). */
  cookedMs: 1400,
  /** Simmering orbit revolution. */
  simmerOrbitMs: 2600,
  /** Orbit-dot opacity pulse. */
  simmerPulseMs: 1300,
  simmerPulseStaggerMs: 430,
  /** Receipt drift one-way (loops reverse). HTML full cycle ~3200ms. */
  receiptDriftMs: 1600,
  /** Receipt scan-line sweep. */
  receiptScanMs: 1800,
  receiptChipStaggerMs: 400,
  /** Empty-pantry CTA ring pulse. */
  emptyPulseMs: 2200,
  /** Sync offline breath (full cycle with reverse ≈ 2400ms). */
  syncBreathMs: 1200,
  /** Sync reconnect snap. */
  syncSnapMs: 700,

  /** Welcome / first-run (outside the five-piece kit). */
  heroPopMs: 700,
  fadeUpMs: 480,
  staggerMs: 110,
  scanSweepMs: 1400,
  breathMs: 1400,
  snapMs: 420,
  chipPopMs: 360,
  fillWipeMs: 380,
  slideOutMs: 420,
  burstMs: 700,
  sproutGrowMs: 900,
  sproutHoldMs: 320,
  cookedMorphMs: 1400,
  simmerLoopMs: 2600,
} as const;

/** UI-state fern (chip / scan / beacon) — distinct from BRAND_LEAF. */
export const MOTION_FERN = '#4E7A45';

export const EASE = {
  outCubic: Easing.out(Easing.cubic),
  inCubic: Easing.in(Easing.cubic),
  inOutCubic: Easing.inOut(Easing.cubic),
  outBack: Easing.out(Easing.back(1.4)),
  outQuad: Easing.out(Easing.quad),
  inOutQuad: Easing.inOut(Easing.quad),
  inOutSine: Easing.inOut(Easing.sin),
  linear: Easing.linear,
} as const;

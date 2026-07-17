/**
 * cookActivity (non-iOS) — Live Activities are an iOS concept; Android no-op.
 * Platform-split keeps expo-widgets' live-activity path out of other bundles
 * (mirrors useExpiringWidget.ts).
 */
import type { CookActivitySnapshot } from './cookActivitySnapshot';

export function syncCookActivity(_snapshot: CookActivitySnapshot): void {}
export function endCookActivity(): void {}

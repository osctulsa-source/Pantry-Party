/**
 * Android / default resolution of useExpiringWidget — a no-op.
 *
 * Home-screen widgets are iOS-only for now (expo-widgets' Android renderer is
 * still a placeholder, and Glance widgets would need Kotlin we don't write).
 * The real implementation lives in useExpiringWidget.ios.ts; this stub keeps
 * expo-widgets/@expo/ui entirely out of the Android JS bundle.
 */
export function useExpiringWidget(): void {}

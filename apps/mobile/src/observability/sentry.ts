/**
 * Sentry init — the observability wiring for Rebuild Milestone 1's dep.
 *
 * DSN comes from EXPO_PUBLIC_SENTRY_DSN (.env.local). Unset = disabled, with a
 * console note instead of a crash — the app must run fine without a Sentry
 * account. sendDefaultPii stays false: the privacy-first position applies to
 * telemetry too (we ship errors, not identities).
 *
 * Called from index.js before the root component registers, so init precedes
 * everything. Breadcrumbs around PowerSync writes/API calls are the follow-up
 * pass once a real DSN is in place.
 */
import * as Sentry from '@sentry/react-native';

export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    console.log('[sentry] EXPO_PUBLIC_SENTRY_DSN unset — error reporting disabled');
    return;
  }
  Sentry.init({ dsn, tracesSampleRate: 0.2, sendDefaultPii: false });
}

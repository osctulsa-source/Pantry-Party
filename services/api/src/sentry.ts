// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.

/**
 * Sentry for the api — import-for-side-effect FIRST in index.ts (the SDK must
 * initialize before express loads to auto-instrument). SENTRY_DSN unset =
 * disabled with a console note; the local stack runs fine without an account.
 * sendDefaultPii false — errors, not identities.
 */
import * as Sentry from '@sentry/node';
import type { Express } from 'express';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0.1, sendDefaultPii: false });
  console.log('[api] sentry error reporting enabled');
} else {
  console.log('[api] SENTRY_DSN unset — error reporting disabled');
}

/** Attach Sentry's Express error handler (after routes, before listen). No-op when disabled. */
export function attachSentryErrorHandler(app: Express): void {
  if (!dsn) return;
  Sentry.setupExpressErrorHandler(app);
}

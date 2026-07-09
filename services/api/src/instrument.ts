/**
 * Sentry for the api — import-for-side-effect FIRST in main.ts (OpenTelemetry
 * must patch http/express/pg before NestJS loads them to auto-instrument).
 * SENTRY_DSN unset = disabled with a console note; the local stack runs fine
 * without an account. Privacy-first telemetry: no user info, no HTTP bodies —
 * we ship errors, not identities.
 */
import * as Sentry from '@sentry/nestjs';
import type { Express } from 'express';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
    tracesSampleRate: 0.1,
    enableLogs: true,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
  });
  console.log('[api] sentry error reporting enabled');
} else {
  console.log('[api] SENTRY_DSN unset — error reporting disabled');
}

/**
 * Attach Sentry's Express error handler (after routes, before listen). Covers
 * the legacy Express routers, which are mounted on the underlying server and
 * never pass through Nest's exception filters. No-op when disabled.
 */
export function attachSentryErrorHandler(app: Express): void {
  if (!dsn) return;
  Sentry.setupExpressErrorHandler(app);
}

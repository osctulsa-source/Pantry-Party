/**
 * NestJS bootstrap — the promoted backend (ADR-008 closed).
 *
 * Migration strategy: NestJS wraps the existing Express app via
 * ExpressAdapter. The four Express routers (upload, household, recipes,
 * health) are mounted on the underlying Express instance UNCHANGED — every
 * wire test passes immediately because the HTTP surface is byte-identical.
 * New endpoints (starting with DELETE /account) use native NestJS modules
 * from birth; the old routers migrate incrementally over future PRs.
 *
 * This file replaces src/index.ts as the entrypoint.
 */
// instrument.js MUST be the very first import — OpenTelemetry has to patch
// http/express/pg before anything else loads them.
import './instrument.js';
import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { uploadRouter } from './routes/upload.js';
import { householdRouter } from './routes/household.js';
import { recipesRouter } from './routes/recipes.js';
import { sweepRunnerSummaries } from './push/fanOut.js';
import { getPushSender } from './push/sender.js';
import { pool } from './db.js';
import { attachSentryErrorHandler } from './instrument.js';

const PORT = Number(process.env.API_PORT ?? '8090');

async function bootstrap(): Promise<void> {
  // The underlying Express instance — receives the legacy routers and the
  // NestJS-managed routes side by side.
  const server = express();

  // Minimal security headers (dependency-free stand-in for helmet; the same
  // set that shipped on Express — preserved byte-for-byte).
  server.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Health probe (unauthenticated, same shape as before).
  server.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Legacy Express routers — mounted verbatim. The test suites import these
  // routers directly and build their own mini Express apps, so the routers
  // themselves are the tested unit; mounting them here is just plumbing.
  server.use(express.json({ limit: '1mb' }));
  server.use(uploadRouter);
  server.use(householdRouter);
  server.use(recipesRouter);

  // NestJS wraps the Express instance. Native NestJS modules (AppModule and
  // future feature modules like AccountModule) register their controllers on
  // the same server — new endpoints appear alongside the legacy routers.
  const adapter = new ExpressAdapter(server);
  const app = await NestFactory.create(AppModule, adapter, {
    logger: ['error', 'warn'],
  });

  // Sentry error handler sits after ALL routes (legacy + NestJS).
  attachSentryErrorHandler(server);

  // Flush Sentry events (and run other lifecycle hooks) on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  await app.listen(PORT);
  console.log(`[api] listening on :${PORT} (NestJS + legacy Express)`);

  // Batched runner-summary ping: check once a minute for runs entering their
  // 5-min departure window. State lives in Postgres (runner_summary_sent_at),
  // so this survives restarts and multiple instances stamp idempotently.
  setInterval(() => {
    void sweepRunnerSummaries({ pg: pool, sender: getPushSender() }).catch((err) =>
      console.error('[api] runner-summary sweep failed:', err),
    );
  }, 60_000).unref();
}

bootstrap().catch((err) => {
  console.error('[api] bootstrap failed:', err);
  process.exit(1);
});

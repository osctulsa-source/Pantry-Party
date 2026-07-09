// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.
//
//    ADR-008 STATUS: /recipes/search made this the service's FOURTH endpoint —
//    the promotion trigger has fired. That route shipped as the LAST Express
//    addition; the next endpoint belongs to the promoted backend.

// Sentry first — the SDK must load before express to auto-instrument.
import './instrument.js';
import express from 'express';
import { householdRouter } from './routes/household.js';
import { uploadRouter } from './routes/upload.js';
import { recipesRouter } from './routes/recipes.js';
import { attachSentryErrorHandler } from './instrument.js';

const PORT = Number(process.env.API_PORT ?? '8090');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Minimal security headers — a dependency-free stand-in for helmet (external
// review §2.8; new npm deps need a local lockfile regen, so hand-set the few
// that matter for a JSON API). CORS stays deliberately unconfigured: the only
// clients are the native apps, which don't send an Origin; browsers have no
// business talking to this service.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Unauthenticated liveness probe for the Docker healthcheck. Deliberately
// returns no info — the real backend will expose proper /readiness later.
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use(uploadRouter);
app.use(householdRouter);
app.use(recipesRouter);

// Sentry's Express error handler sits after the routes (no-op when disabled).
attachSentryErrorHandler(app);

app.listen(PORT, () => {
  console.log(`[api] listening on :${PORT}`);
});

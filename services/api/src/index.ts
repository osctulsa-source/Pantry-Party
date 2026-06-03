// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.

import express from 'express';
import { uploadRouter } from './routes/upload.js';

const PORT = Number(process.env.API_PORT ?? '8090');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Unauthenticated liveness probe for the Docker healthcheck. Deliberately
// returns no info — the real backend will expose proper /readiness later.
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use(uploadRouter);

app.listen(PORT, () => {
  console.log(`[api] listening on :${PORT}`);
});

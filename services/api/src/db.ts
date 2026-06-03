// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.

import pg from 'pg';

const { Pool } = pg;

// In local-dev compose, the api container reaches pg-db over the docker
// network. PG_URI overrides for tests / alternative environments.
const connectionString =
  process.env.PG_URI ?? 'postgresql://postgres:postgres@pg-db:5434/postgres';

export const pool = new Pool({
  connectionString,
  // Small pool: this is a single-instance throwaway. Tune in the real backend.
  max: 5,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[api] unexpected pg pool error:', err);
});

export type Pool = pg.Pool;

// Shared Postgres pool for the hybrid NestJS/legacy Express API (ADR-009).

import pg from 'pg';

const { Pool } = pg;

// In local-dev compose, the api container reaches pg-db over the docker
// network. PG_URI overrides for tests / alternative environments.
const connectionString =
  process.env.PG_URI ?? 'postgresql://postgres:postgres@pg-db:5434/postgres';

export const pool = new Pool({
  connectionString,
  // Keep the Railway/local footprint small; revisit with measured concurrency.
  max: 5,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[api] unexpected pg pool error:', err);
});

export type Pool = pg.Pool;

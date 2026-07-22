// Vitest globalSetup for the integration suite: apply the init-scripts baseline
// to the target Postgres exactly once, before any integration test file runs.
// Individual files truncate between cases; the schema is applied here.

import { applySchema, makeTestPool, testConnectionString } from './helpers/schema.js';

export default async function setup(): Promise<void> {
  const pool = makeTestPool();
  try {
    await applySchema(pool);
    console.log(
      `[integration] schema applied to ${testConnectionString().replace(/:[^:@/]+@/, ':***@')}`,
    );
  } finally {
    await pool.end();
  }
}

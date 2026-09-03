import { defineConfig } from 'vitest/config';

// Integration suite: runs the real route/controller code against a live
// Postgres (PG_URI / TEST_DATABASE_URL). Kept separate from the default unit
// config so `npm test` stays hermetic (no DB required) and CI can gate this in
// its own job with a postgres service container.
//
// auth.ts reads API_JWKS_URI at import time; the tests mock jose, but the env
// check still runs on the import chain.
if (!process.env.API_JWKS_URI) {
  process.env.API_JWKS_URI = 'https://example.com/jwks.json';
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__integration__/**/*.integration.test.ts'],
    globalSetup: ['src/__integration__/globalSetup.ts'],
    // One shared database — run files sequentially so they don't truncate each
    // other's rows mid-flight.
    fileParallelism: false,
    // Real DB round-trips + schema apply are slower than the mocked unit tests.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

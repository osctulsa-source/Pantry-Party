import { defineConfig } from 'vitest/config';

// src/middleware/auth.ts throws at import time if API_JWKS_URI is unset, and the
// upload route (and its tests) transitively import that middleware. CI exports a
// real stub explicitly; this default keeps local `npm test -w services/api` working
// without any env-var prep. An explicitly-exported API_JWKS_URI (e.g. in CI) still
// wins, so behavior there is unchanged.
if (!process.env.API_JWKS_URI) {
  process.env.API_JWKS_URI = 'https://example.com/jwks.json';
}

export default defineConfig({
  test: {
    environment: 'node',
    // The __integration__ suite needs a live Postgres and runs in its own CI
    // job via vitest.integration.config.ts — keep the default `npm test`
    // hermetic by excluding it here.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/__integration__/**'],
  },
});

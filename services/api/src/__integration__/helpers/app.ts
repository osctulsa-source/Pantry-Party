// Builds Express apps from the REAL routers/controller for supertest, against
// the live pool in db.ts (pointed at the test database via the PG_URI env var).
// Routers are imported dynamically so this runs after the per-file vi.mock('jose')
// hoist and after PG_URI is in the environment.
import express, { type Express } from 'express';

export async function buildUploadApp(): Promise<Express> {
  const { uploadRouter } = await import('../../routes/upload.js');
  const app = express();
  app.use(express.json());
  app.use(uploadRouter);
  return app;
}

export async function buildHouseholdApp(): Promise<Express> {
  const { householdRouter } = await import('../../routes/household.js');
  const app = express();
  app.use(express.json());
  app.use(householdRouter);
  return app;
}

export async function buildAccountApp(): Promise<Express> {
  const { AccountController } = await import('../../modules/account/account.controller.js');
  const app = express();
  app.use(express.json());
  const ctrl = new AccountController();
  app.delete('/account', (req, res, next) => {
    ctrl
      .deleteAccount(req)
      .then((result) => res.json(result))
      .catch(next);
  });
  return app;
}

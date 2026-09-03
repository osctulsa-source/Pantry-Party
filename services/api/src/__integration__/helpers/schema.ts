// Real-Postgres integration harness — applies the init-scripts baseline to a
// live database and provides seed/reset helpers. Unlike the unit suites (which
// mock `pg` at the driver boundary and so never parse real SQL), these run the
// route/controller code against actual Postgres, catching type/DDL/constraint
// drift — e.g. the `household_invites.used_by = 'deleted'` uuid-coercion bug
// that shipped precisely because the driver was mocked.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
// services/api/src/__integration__/helpers -> repo root -> the DB schema module.
const DB_MODULE = resolve(
  HERE,
  '../../../../../infra/local-dev/docker/modules/database-postgres',
);
const INIT_DIR = join(DB_MODULE, 'init-scripts');

// Every table the init-scripts create — the truncate target between tests.
export const ALL_TABLES = [
  'announcement_reactions',
  'announcements',
  'activity_events',
  'favorite_recipes',
  'shopping_list_items',
  'pantry_items',
  'household_invites',
  'user_households',
  'households',
  'push_tokens',
  'analytics_events',
] as const;

export function testConnectionString(): string {
  return (
    process.env.PG_URI ??
    process.env.TEST_DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/postgres'
  );
}

export function makeTestPool(): pg.Pool {
  return new pg.Pool({ connectionString: testConnectionString(), max: 4 });
}

/**
 * Drop everything and re-apply the numbered init-scripts (00-08) in order —
 * the documented "current baseline for a fresh Postgres volume". This is what a
 * fresh local/compose or production database gets; the numbered migrations/ are
 * the incremental path for already-provisioned databases and are not replayed
 * on top of the baseline (they'd be redundant / non-idempotent).
 */
export async function applySchema(pool: pg.Pool): Promise<void> {
  // Publications live at the database (not schema) level, so DROP SCHEMA won't
  // clear them — drop explicitly so 08-powersync-publication.sql can re-create.
  await pool.query('DROP PUBLICATION IF EXISTS powersync');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');

  const files = readdirSync(INIT_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await pool.query(readFileSync(join(INIT_DIR, file), 'utf8'));
  }
}

/** Fast per-test cleanup: keep the schema, drop all rows. */
export async function truncateAll(pool: pg.Pool): Promise<void> {
  await pool.query(`TRUNCATE ${ALL_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

// ---- Seed helpers -------------------------------------------------------

export async function seedHousehold(
  pool: pg.Pool,
  args: { id: string; name?: string; createdBy: string },
): Promise<void> {
  await pool.query('INSERT INTO households (id, name, created_by) VALUES ($1, $2, $3)', [
    args.id,
    args.name ?? 'Test Household',
    args.createdBy,
  ]);
}

export async function seedMembership(
  pool: pg.Pool,
  args: { userId: string; householdId: string; role?: 'owner' | 'member' },
): Promise<void> {
  // The surrogate `id` is a real UUID (gen_random_uuid) — tests never assert on
  // it, so let Postgres mint it rather than pass a fake.
  await pool.query(
    'INSERT INTO user_households (id, user_id, household_id, role) VALUES (gen_random_uuid(), $1, $2, $3)',
    [args.userId, args.householdId, args.role ?? 'member'],
  );
}

/** Create a household with its owner membership in one shot (the common case). */
export async function seedHouseholdWithOwner(
  pool: pg.Pool,
  args: { householdId: string; ownerId: string; name?: string },
): Promise<void> {
  await seedHousehold(pool, { id: args.householdId, name: args.name, createdBy: args.ownerId });
  await seedMembership(pool, {
    userId: args.ownerId,
    householdId: args.householdId,
    role: 'owner',
  });
}

/** The mock-jose token shape the routes accept: `Bearer test:<sub>`. */
export function bearer(userId: string): string {
  return `Bearer test:${userId}`;
}

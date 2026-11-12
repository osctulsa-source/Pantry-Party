// Real-Postgres integration test for DELETE /account — the store-gate cascade.
//
// This is the regression proof for P0-#1: the previous cascade ran
//   UPDATE household_invites SET used_at = NOW(), used_by = 'deleted' ...
// and `used_by` is a UUID column, so the 'deleted' literal failed uuid coercion
// at query-parse time and 500'd EVERY call. The mocked unit suite couldn't see
// it because the driver never parsed the SQL. Here real Postgres does.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => null,
  jwtVerify: vi.fn(async (token: string) => {
    if (typeof token === 'string' && token.startsWith('test:')) {
      const sub = token.slice('test:'.length);
      if (!sub) throw new Error('empty sub');
      return { payload: { sub, aud: 'authenticated' } };
    }
    throw new Error('invalid token');
  }),
}));

// The controller's Supabase admin-delete is a separate HTTP call. The
// controller refuses to run without admin credentials, so provide fakes and
// stub fetch — the suite never hits the network.
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })));

const { makeTestPool, truncateAll, seedHousehold, seedMembership, bearer } = await import(
  './helpers/schema.js'
);
const { buildAccountApp } = await import('./helpers/app.js');
const { default: request } = await import('supertest');

const pool = makeTestPool();
const app = await buildAccountApp();

const USER_A = '00000000-0000-0000-0000-0000000000a1';
const USER_B = '00000000-0000-0000-0000-0000000000b2';
const HH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeAll(async () => {
  // Fail fast with a clear message if the DB isn't reachable.
  await pool.query('SELECT 1');
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DELETE /account (real Postgres)', () => {
  it('completes the full cascade end-to-end (P0-#1 regression: invite revoke does not 500)', async () => {
    // Household owned by A, with B as a longer-lived... no — A is owner, B is a
    // co-member who should inherit ownership.
    await seedHousehold(pool, { id: HH, name: 'Shared', createdBy: USER_A });
    await seedMembership(pool, { userId: USER_A, householdId: HH, role: 'owner' });
    await seedMembership(pool, { userId: USER_B, householdId: HH, role: 'member' });

    // A's pantry + shopping items, and an outstanding invite A created.
    await pool.query(
      `INSERT INTO pantry_items (id, household_id, name, added_at, source, added_by, updated_at, deleted)
       VALUES (gen_random_uuid(), $1, 'Eggs', NOW(), 'manual', $2, $3, false)`,
      [HH, USER_A, Date.now()],
    );
    await pool.query(
      `INSERT INTO shopping_list_items (id, household_id, name, added_at, source, added_by, updated_at, deleted)
       VALUES (gen_random_uuid(), $1, 'Milk', NOW(), 'manual', $2, $3, false)`,
      [HH, USER_A, Date.now()],
    );
    await pool.query(
      `INSERT INTO household_invites (id, household_id, invite_code, created_by)
       VALUES (gen_random_uuid(), $1, 'ABC123', $2)`,
      [HH, USER_A],
    );

    // Attribution rows across the remaining household tables + a push token.
    await pool.query(
      `INSERT INTO favorite_recipes (id, household_id, recipe_id, title, payload, added_by, added_at, updated_at)
       VALUES (gen_random_uuid(), $1, 1, 'Soup', '{}', $2, NOW(), $3)`,
      [HH, USER_A, Date.now()],
    );
    await pool.query(
      `INSERT INTO activity_events (id, household_id, kind, label, occurred_at, added_by, updated_at)
       VALUES (gen_random_uuid(), $1, 'cooked', 'Soup', NOW(), $2, $3)`,
      [HH, USER_A, Date.now()],
    );
    const ann = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    await pool.query(
      `INSERT INTO announcements (id, household_id, kind, created_by, created_at, updated_at)
       VALUES ($1, $2, 'runner', $3, NOW(), $4)`,
      [ann, HH, USER_A, Date.now()],
    );
    await pool.query(
      `INSERT INTO announcement_reactions (id, announcement_id, household_id, user_id, reaction, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, '👍', NOW(), $4)`,
      [ann, HH, USER_A, Date.now()],
    );
    await pool.query(
      `INSERT INTO push_tokens (id, user_id, token, platform, updated_at)
       VALUES (gen_random_uuid(), $1, 'ExponentPushToken[x]', 'ios', $2)`,
      [USER_A, Date.now()],
    );

    await pool.query(
      `INSERT INTO analytics_events (id, install_id, user_id, event, occurred_at)
       VALUES (gen_random_uuid(), 'install-1', $1, 'app_open', NOW())`,
      [USER_A],
    );

    const res = await request(app).delete('/account').set('Authorization', bearer(USER_A));

    // The whole point of P0-#1: this used to be a 500.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deleted: USER_A });

    // Nothing anywhere still carries the deleted user's id — the rows A added
    // are tombstoned and re-attributed to the nil UUID.
    const NIL = '00000000-0000-0000-0000-000000000000';
    for (const [table, col] of [
      ['pantry_items', 'added_by'],
      ['shopping_list_items', 'added_by'],
      ['favorite_recipes', 'added_by'],
      ['activity_events', 'added_by'],
      ['announcements', 'created_by'],
      ['announcement_reactions', 'user_id'],
    ] as const) {
      const mine = await pool.query(`SELECT 1 FROM ${table} WHERE ${col} = $1`, [USER_A]);
      expect(mine.rowCount, `${table} still attributes rows to the deleted user`).toBe(0);
      const scrubbed = await pool.query(`SELECT deleted FROM ${table} WHERE ${col} = $1`, [NIL]);
      expect(scrubbed.rowCount, `${table} should keep one anonymized tombstone`).toBe(1);
      expect(scrubbed.rows[0].deleted).toBe(true);
    }

    // Push tokens, invites, and the analytics link are gone outright.
    for (const sql of [
      'SELECT 1 FROM push_tokens WHERE user_id = $1',
      'SELECT 1 FROM household_invites WHERE created_by = $1 OR used_by = $1',
      'SELECT 1 FROM analytics_events WHERE user_id = $1',
    ]) {
      expect((await pool.query(sql, [USER_A])).rowCount, sql).toBe(0);
    }
    expect((await pool.query('SELECT 1 FROM analytics_events')).rowCount).toBe(1);

    // A's membership removed; ownership — and households.created_by — moved to B.
    const aMembership = await pool.query(
      'SELECT 1 FROM user_households WHERE user_id = $1',
      [USER_A],
    );
    expect(aMembership.rowCount).toBe(0);
    const bRole = await pool.query(
      'SELECT role FROM user_households WHERE user_id = $1 AND household_id = $2',
      [USER_B, HH],
    );
    expect(bRole.rows[0].role).toBe('owner');
    const hh = await pool.query('SELECT created_by FROM households WHERE id = $1', [HH]);
    expect(hh.rows[0].created_by).toBe(USER_B);
  });

  it('a sole-member household survives ownerless, with created_by scrubbed', async () => {
    await seedHousehold(pool, { id: HH, name: 'Solo', createdBy: USER_A });
    await seedMembership(pool, { userId: USER_A, householdId: HH, role: 'owner' });

    const res = await request(app).delete('/account').set('Authorization', bearer(USER_A));
    expect(res.status).toBe(200);

    const hh = await pool.query('SELECT created_by FROM households WHERE id = $1', [HH]);
    expect(hh.rows[0].created_by).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('is idempotent — deleting an already-deleted user still returns 200', async () => {
    const res = await request(app).delete('/account').set('Authorization', bearer(USER_A));
    expect(res.status).toBe(200);
  });
});

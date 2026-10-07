// Real-Postgres integration tests for POST /sync/upload.
//
// Covers (a) upload round-trips per table against real SQL, and (b) the P0-#2
// write-side tenancy proofs: a PUT carrying a FOREIGN household_id must be
// rejected, and a user_households self-join as owner must be rejected. These
// negatives FAIL before the authorizePutWrite chokepoint and PASS after.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

// fanOut fires push best-effort after commit; stub the sender's network out.
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })));

const { makeTestPool, truncateAll, seedHouseholdWithOwner, seedMembership, bearer } = await import(
  './helpers/schema.js'
);
const { buildUploadApp } = await import('./helpers/app.js');
const { default: request } = await import('supertest');

const pool = makeTestPool();
const app = await buildUploadApp();

const USER_A = '00000000-0000-0000-0000-0000000000a1';
const USER_B = '00000000-0000-0000-0000-0000000000b2';
const USER_C = '00000000-0000-0000-0000-0000000000c3';
const HH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function upload(body: object, userId: string) {
  return request(app).post('/sync/upload').set('Authorization', bearer(userId)).send(body);
}

beforeAll(async () => {
  await pool.query('SELECT 1');
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
  // A owns household A; B owns household B. Neither is a member of the other's.
  await seedHouseholdWithOwner(pool, { householdId: HH_A, ownerId: USER_A, name: 'A household' });
  await seedHouseholdWithOwner(pool, { householdId: HH_B, ownerId: USER_B, name: 'B household' });
});

describe('POST /sync/upload — round-trips (real Postgres)', () => {
  it('inserts, edits, then tombstones a pantry_items row for a member', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const put = await upload(
      {
        crud: [
          {
            op: 'PUT',
            type: 'pantry_items',
            id,
            data: {
              household_id: HH_A,
              name: 'Eggs',
              quantity: 12,
              location: 'fridge',
              added_at: '2026-01-01T00:00:00.000Z',
              source: 'manual',
              added_by: USER_A,
              updated_at: 1730000000000,
              deleted: false,
            },
          },
        ],
      },
      USER_A,
    );
    expect(put.status).toBe(200);
    let row = await pool.query('SELECT name, quantity, deleted FROM pantry_items WHERE id = $1', [id]);
    expect(row.rows[0]).toMatchObject({ name: 'Eggs', quantity: 12, deleted: false });

    const patch = await upload(
      { crud: [{ op: 'PATCH', type: 'pantry_items', id, data: { quantity: 6, updated_at: 1730000000001 } }] },
      USER_A,
    );
    expect(patch.status).toBe(200);
    row = await pool.query('SELECT quantity FROM pantry_items WHERE id = $1', [id]);
    expect(row.rows[0].quantity).toBe(6);

    const tombstone = await upload(
      { crud: [{ op: 'PATCH', type: 'pantry_items', id, data: { deleted: true, updated_at: 1730000000002 } }] },
      USER_A,
    );
    expect(tombstone.status).toBe(200);
    row = await pool.query('SELECT deleted FROM pantry_items WHERE id = $1', [id]);
    expect(row.rows[0].deleted).toBe(true);
  });

  it('accepts a member PUT for each household-scoped data table', async () => {
    const cases: Array<{ type: string; data: Record<string, unknown> }> = [
      {
        type: 'shopping_list_items',
        data: { name: 'Milk', quantity: 1, source: 'manual', added_at: '2026-01-01T00:00:00.000Z', added_by: USER_A, updated_at: 1, deleted: false },
      },
      {
        type: 'favorite_recipes',
        data: { recipe_id: 1, title: 'Soup', payload: '{}', added_by: USER_A, added_at: '2026-01-01T00:00:00.000Z', updated_at: 1, deleted: false },
      },
      {
        type: 'activity_events',
        data: { kind: 'cooked', label: 'Soup', occurred_at: '2026-01-01T00:00:00.000Z', added_by: USER_A, updated_at: 1, deleted: false },
      },
    ];
    for (const [i, c] of cases.entries()) {
      const id = `22222222-2222-2222-2222-00000000000${i}`;
      const res = await upload(
        { crud: [{ op: 'PUT', type: c.type, id, data: { household_id: HH_A, ...c.data } }] },
        USER_A,
      );
      expect(res.status, `${c.type} PUT should succeed for a member`).toBe(200);
      const row = await pool.query(`SELECT 1 FROM ${c.type} WHERE id = $1`, [id]);
      expect(row.rowCount, `${c.type} row should exist`).toBe(1);
    }
  });
});

describe('POST /sync/upload — write-side tenancy (P0-#2)', () => {
  it('rejects a pantry_items PUT into a household the caller is not a member of', async () => {
    const res = await upload(
      {
        crud: [
          {
            op: 'PUT',
            type: 'pantry_items',
            id: '33333333-3333-3333-3333-333333333333',
            data: {
              household_id: HH_A, // A's household…
              name: 'Injected',
              added_at: '2026-01-01T00:00:00.000Z',
              source: 'manual',
              added_by: USER_B, // …written by B (B's own JWT sub, so tenancy-on-added_by passes)
              updated_at: 1,
              deleted: false,
            },
          },
        ],
      },
      USER_B,
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not a member/i);
    const row = await pool.query('SELECT 1 FROM pantry_items WHERE household_id = $1', [HH_A]);
    expect(row.rowCount).toBe(0);
  });

  it('rejects a user_households PUT self-joining another household as owner', async () => {
    const res = await upload(
      {
        crud: [
          {
            op: 'PUT',
            type: 'user_households',
            id: '44444444-4444-4444-4444-444444444444',
            data: { user_id: USER_B, household_id: HH_A, role: 'owner' },
          },
        ],
      },
      USER_B,
    );
    expect(res.status).toBe(403);
    // B never becomes a member of A's household.
    const row = await pool.query(
      'SELECT 1 FROM user_households WHERE user_id = $1 AND household_id = $2',
      [USER_B, HH_A],
    );
    expect(row.rowCount).toBe(0);
  });

  it('rejects a PUT that relocates an existing row from another household into the caller’s', async () => {
    // A row lives in B's household. A (a member of A only) knows its id and tries
    // to pull it into A via the upsert. household_id is immutable — this must 403.
    const rowId = '99999999-9999-9999-9999-999999999999';
    await pool.query(
      `INSERT INTO pantry_items (id, household_id, name, added_at, source, added_by, updated_at, deleted)
       VALUES ($1, $2, 'B item', NOW(), 'manual', $3, 1, false)`,
      [rowId, HH_B, USER_B],
    );
    const res = await upload(
      {
        crud: [
          {
            op: 'PUT',
            type: 'pantry_items',
            id: rowId,
            data: {
              household_id: HH_A, // pull it into A…
              name: 'stolen',
              added_at: '2026-01-01T00:00:00.000Z',
              source: 'manual',
              added_by: USER_A, // …as A (A's own JWT sub)
              updated_at: 2,
              deleted: false,
            },
          },
        ],
      },
      USER_A,
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/between households/i);
    // The row is untouched — still B's.
    const row = await pool.query('SELECT household_id, name FROM pantry_items WHERE id = $1', [rowId]);
    expect(row.rows[0]).toMatchObject({ household_id: HH_B, name: 'B item' });
  });

  it('rejects a households PUT overwriting another household the caller is not in', async () => {
    const res = await upload(
      { crud: [{ op: 'PUT', type: 'households', id: HH_A, data: { name: 'Hijacked', created_by: USER_B } }] },
      USER_B,
    );
    expect(res.status).toBe(403);
    const row = await pool.query('SELECT name, created_by FROM households WHERE id = $1', [HH_A]);
    expect(row.rows[0]).toMatchObject({ name: 'A household', created_by: USER_A });
  });
});

describe('POST /sync/upload — bootstrap (ensureDefaultHousehold)', () => {
  it('permits creating your own household + owner membership in one batch', async () => {
    const newHh = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const res = await upload(
      {
        crud: [
          { op: 'PUT', type: 'households', id: newHh, data: { name: 'C household', created_by: USER_C } },
          {
            op: 'PUT',
            type: 'user_households',
            id: '55555555-5555-5555-5555-555555555555',
            data: { user_id: USER_C, household_id: newHh, role: 'owner' },
          },
        ],
      },
      USER_C,
    );
    expect(res.status).toBe(200);
    const hh = await pool.query('SELECT created_by FROM households WHERE id = $1', [newHh]);
    expect(hh.rows[0].created_by).toBe(USER_C);
    const membership = await pool.query(
      'SELECT role FROM user_households WHERE user_id = $1 AND household_id = $2',
      [USER_C, newHh],
    );
    expect(membership.rows[0].role).toBe('owner');
  });
});

describe('POST /sync/upload — ownership columns are immutable on upsert', () => {
  // A new-device client that re-inserts rows it already has server-side (e.g. a
  // local seed of the household + membership with the Postgres ids) replays
  // them as PUTs. The upsert must not let that rewrite who created the
  // household or what role the member holds.
  it('a member re-PUTting the household cannot claim created_by', async () => {
    await seedMembership(pool, { userId: USER_C, householdId: HH_A, role: 'member' });
    const res = await upload(
      {
        crud: [
          { op: 'PUT', type: 'households', id: HH_A, data: { name: 'My Pantry', created_by: USER_C } },
        ],
      },
      USER_C,
    );
    expect(res.status).toBe(200);
    const hh = await pool.query('SELECT name, created_by FROM households WHERE id = $1', [HH_A]);
    expect(hh.rows[0]).toMatchObject({ name: 'A household', created_by: USER_A });
  });

  it('a member re-PUTting their membership (with the household) cannot become owner', async () => {
    await seedMembership(pool, { userId: USER_C, householdId: HH_A, role: 'member' });
    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM user_households WHERE user_id = $1 AND household_id = $2',
      [USER_C, HH_A],
    );
    const membershipId = rows[0]!.id;
    const res = await upload(
      {
        crud: [
          { op: 'PUT', type: 'households', id: HH_A, data: { name: 'My Pantry', created_by: USER_C } },
          {
            op: 'PUT',
            type: 'user_households',
            id: membershipId,
            data: { user_id: USER_C, household_id: HH_A, role: 'owner' },
          },
        ],
      },
      USER_C,
    );
    expect(res.status).toBe(200);
    const m = await pool.query('SELECT role FROM user_households WHERE id = $1', [membershipId]);
    expect(m.rows[0]).toMatchObject({ role: 'member' });
  });

  it('a non-member cannot self-join by also claiming the household in the same batch', async () => {
    const res = await upload(
      {
        crud: [
          { op: 'PUT', type: 'households', id: HH_A, data: { name: 'x', created_by: USER_C } },
          {
            op: 'PUT',
            type: 'user_households',
            id: '99999999-9999-9999-9999-999999999999',
            data: { user_id: USER_C, household_id: HH_A, role: 'owner' },
          },
        ],
      },
      USER_C,
    );
    expect(res.status).toBe(403);
    const m = await pool.query('SELECT 1 FROM user_households WHERE user_id = $1', [USER_C]);
    expect(m.rowCount).toBe(0);
  });
});

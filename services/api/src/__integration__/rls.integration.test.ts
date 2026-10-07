// Real-Postgres check that every public table denies non-owner roles.
//
// On Supabase the `anon` and `authenticated` roles hold table grants on
// `public` and reach it through PostgREST with the anon key that ships in the
// app. Init-script 09 / migration 0010 enable RLS with no policies so those
// roles see nothing. `rls_probe` stands in for them here: it gets full grants,
// exactly like Supabase's defaults, and must still be unable to read or write.

import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ALL_TABLES, makeTestPool, seedHousehold, truncateAll } from './helpers/schema.js';

const pool = makeTestPool();

const USER_A = '00000000-0000-0000-0000-0000000000a1';
const HH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeAll(async () => {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_probe') THEN
        CREATE ROLE rls_probe NOLOGIN;
      END IF;
    END
    $$;
  `);
  await pool.query('GRANT USAGE ON SCHEMA public TO rls_probe');
  await pool.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO rls_probe');
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

async function asProbe<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE rls_probe');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

describe('row level security (real Postgres)', () => {
  it('is enabled on every table in the public schema', async () => {
    const { rows } = await pool.query<{ relname: string }>(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND NOT c.relrowsecurity
      ORDER BY c.relname
    `);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('hides existing rows from a granted non-owner role', async () => {
    await seedHousehold(pool, { id: HH, createdBy: USER_A });

    const visible = await asProbe(async (client) => {
      const counts: Record<string, number> = {};
      for (const table of ALL_TABLES) {
        const { rows } = await client.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`);
        counts[table] = Number(rows[0]?.n);
      }
      return counts;
    });

    expect(Object.values(visible).every((n) => n === 0)).toBe(true);
    const { rows } = await pool.query<{ n: string }>('SELECT count(*) AS n FROM households');
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it('rejects inserts from a granted non-owner role', async () => {
    await expect(
      asProbe((client) =>
        client.query('INSERT INTO households (id, name, created_by) VALUES ($1, $2, $3)', [
          HH,
          'Intruder',
          USER_A,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

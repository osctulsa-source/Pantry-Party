// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.

// jose's module loader walks env at import-time of the auth middleware. The
// upload route doesn't import auth (router-level middleware injection is at
// runtime), so these unit tests don't touch it — but if a future refactor
// pulls auth into the route file, set API_JWKS_URI here.

import { describe, expect, it } from 'vitest';
import { buildUpsertSql, validateCrudEntry } from '../routes/upload.js';

const USER = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-000000000002';

describe('validateCrudEntry', () => {
  it('accepts a well-formed household PUT for the signed-in user', () => {
    const result = validateCrudEntry(
      {
        op: 'PUT',
        type: 'households',
        id: 'h1',
        data: { name: 'My Pantry', created_by: USER },
      },
      USER,
    );
    expect(result).toEqual({
      ok: true,
      table: 'households',
      columns: ['id', 'name', 'created_by'],
      values: ['h1', 'My Pantry', USER],
    });
  });

  it('rejects a household PUT whose created_by does not match the JWT sub', () => {
    const result = validateCrudEntry(
      { op: 'PUT', type: 'households', id: 'h1', data: { name: 'X', created_by: OTHER } },
      USER,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/tenancy.*created_by/);
  });

  it('rejects a user_households PUT whose user_id does not match the JWT sub', () => {
    const result = validateCrudEntry(
      {
        op: 'PUT',
        type: 'user_households',
        id: 'm1',
        data: { user_id: OTHER, household_id: 'h1', role: 'owner' },
      },
      USER,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/tenancy.*user_id/);
  });

  it('rejects PATCH and DELETE (PR #8a is PUT-only)', () => {
    for (const op of ['PATCH', 'DELETE'] as const) {
      const result = validateCrudEntry({ op, type: 'households', id: 'h1' }, USER);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects an unknown table', () => {
    const result = validateCrudEntry({ op: 'PUT', type: 'shopping_lists', id: 'x' }, USER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown table/);
  });

  it('drops columns not in the allowlist (defense against client schema drift)', () => {
    const result = validateCrudEntry(
      {
        op: 'PUT',
        type: 'households',
        id: 'h1',
        data: { name: 'X', created_by: USER, mystery_column: 'should-be-dropped' },
      },
      USER,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.columns).not.toContain('mystery_column');
  });

  it('accepts a pantry_items PUT and only the columns we allow', () => {
    const result = validateCrudEntry(
      {
        op: 'PUT',
        type: 'pantry_items',
        id: 'p1',
        data: {
          household_id: 'h1',
          name: 'Eggs',
          quantity: 12,
          location: 'fridge',
          added_at: '2026-01-01T00:00:00.000Z',
          source: 'manual',
          added_by: USER,
          updated_at: 1730000000000,
          deleted: 0,
        },
      },
      USER,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.columns).toContain('quantity');
      expect(result.columns).toContain('added_by');
      expect(result.values[result.columns.indexOf('added_by')]).toBe(USER);
    }
  });
});

describe('buildUpsertSql', () => {
  it('builds an INSERT … ON CONFLICT (id) DO UPDATE for multi-column inserts', () => {
    const { sql, placeholders } = buildUpsertSql('households', ['id', 'name', 'created_by']);
    expect(sql).toBe(
      'INSERT INTO households (id, name, created_by) ' +
        'VALUES ($1, $2, $3) ' +
        'ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, created_by = EXCLUDED.created_by',
    );
    expect(placeholders).toBe(3);
  });

  it('falls back to DO NOTHING when only id is present', () => {
    const { sql } = buildUpsertSql('households', ['id']);
    expect(sql).toBe('INSERT INTO households (id) VALUES ($1) ON CONFLICT (id) DO NOTHING');
  });
});

// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.

import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { requireUser, type AuthedRequest } from '../middleware/auth.js';

const router: ReturnType<typeof Router> = Router();

// PowerSync's CrudEntry.toJSON() shape. We only consume a subset.
// See node_modules/@powersync/common/lib/client/sync/bucket/CrudEntry.d.ts
const CrudEntrySchema = z.object({
  op: z.enum(['PUT', 'PATCH', 'DELETE']),
  type: z.string().min(1), // the source table name
  id: z.string().min(1),
  data: z.record(z.unknown()).optional(),
  // ignored: op_id, tx_id, old, metadata
});
const UploadPayloadSchema = z.object({
  crud: z.array(CrudEntrySchema),
});

type CrudEntry = z.infer<typeof CrudEntrySchema>;

// The set of tables this throwaway service knows how to write. New tables
// require an entry here AND a matching apply* function. Anything else 4xx's
// rather than silently no-op'ing.
const KNOWN_TABLES = new Set(['households', 'user_households', 'pantry_items']);

// For each table, the columns we'll accept and forward to Postgres. Anything
// else in `data` is dropped — defensive against future schema additions on the
// client that the server hasn't been taught about yet.
//
// `created_at` is intentionally NOT here for the join/data tables — the client
// sends ISO strings, but Postgres assigns its own NOW() default. Letting it
// default keeps drift between the client clock and server time out of the
// indexed columns.
const ALLOWED_COLUMNS: Record<string, readonly string[]> = {
  households: ['id', 'name', 'created_by'],
  user_households: ['id', 'user_id', 'household_id', 'role'],
  pantry_items: [
    'id',
    'household_id',
    'name',
    'brand',
    'category',
    'barcode',
    'quantity',
    'unit',
    'location',
    'added_at',
    'expires_at',
    'source',
    'added_by',
    'updated_at',
    'deleted',
  ],
};

// Columns whose value MUST equal req.userId (the verified JWT `sub`). This is
// the tenancy enforcement that prevents A from spoofing writes as B.
const USER_ID_COLUMNS: Record<string, readonly string[]> = {
  households: ['created_by'],
  user_households: ['user_id'],
  pantry_items: ['added_by'],
};

/**
 * Validates a single CrudEntry against table allowlist, column allowlist, and
 * user-id tenancy. Returns `{ ok: true, ... }` with everything needed to build
 * the SQL, or `{ ok: false, error }` for caller to bubble up as 400.
 *
 * Pure: no IO, no side effects. Easy to unit-test.
 */
export function validateCrudEntry(
  entry: CrudEntry,
  userId: string,
): { ok: true; table: string; columns: string[]; values: unknown[] } | { ok: false; error: string } {
  if (!KNOWN_TABLES.has(entry.type)) {
    return { ok: false, error: `unknown table "${entry.type}"` };
  }

  // PR #8a scope: PUT only. PATCH + DELETE land when Add Item (PR #8b) needs them.
  if (entry.op !== 'PUT') {
    return { ok: false, error: `op "${entry.op}" not supported yet (PUT only in PR #8a)` };
  }

  const data = entry.data ?? {};
  const allowed = ALLOWED_COLUMNS[entry.type] ?? [];
  const userIdCols = USER_ID_COLUMNS[entry.type] ?? [];

  // The CrudEntry's `id` is the row primary key; PowerSync stores it separately
  // from `data`. Splice it into the value set as the `id` column.
  const merged: Record<string, unknown> = { id: entry.id, ...data };

  for (const col of userIdCols) {
    if (merged[col] !== userId) {
      return {
        ok: false,
        error: `tenancy: column "${col}" on table "${entry.type}" must equal JWT sub`,
      };
    }
  }

  const columns: string[] = [];
  const values: unknown[] = [];
  for (const col of allowed) {
    if (Object.prototype.hasOwnProperty.call(merged, col)) {
      columns.push(col);
      values.push(merged[col]);
    }
  }
  if (columns.length === 0) {
    return { ok: false, error: `no recognized columns for table "${entry.type}"` };
  }

  return { ok: true, table: entry.type, columns, values };
}

/**
 * Builds an idempotent upsert: INSERT … ON CONFLICT (id) DO UPDATE.
 * Pure helper, easy to unit-test.
 *
 * PowerSync's PUT semantic is "insert or replace" — re-sending the same op_id
 * must not error. Upsert on `id` matches that.
 */
export function buildUpsertSql(
  table: string,
  columns: string[],
): { sql: string; placeholders: number } {
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updates = columns
    .filter((c) => c !== 'id')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');

  // No non-id columns to update? Bare INSERT … ON CONFLICT DO NOTHING.
  const conflictClause = updates ? `DO UPDATE SET ${updates}` : 'DO NOTHING';

  return {
    sql:
      `INSERT INTO ${table} (${columns.join(', ')}) ` +
      `VALUES (${placeholders}) ` +
      `ON CONFLICT (id) ${conflictClause}`,
    placeholders: columns.length,
  };
}

router.post('/sync/upload', requireUser, async (req, res) => {
  const parsed = UploadPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid payload', issues: parsed.error.issues });
    return;
  }

  const userId = (req as AuthedRequest).userId;
  const entries = parsed.data.crud;

  // Validate every entry first; reject the whole batch if any fails. Atomic +
  // honest — PowerSync will retry the batch as a unit.
  const validations = entries.map((e) => ({ entry: e, result: validateCrudEntry(e, userId) }));
  const firstError = validations.find((v) => !v.result.ok);
  if (firstError && !firstError.result.ok) {
    res.status(400).json({
      ok: false,
      error: firstError.result.error,
      offendingEntry: { op: firstError.entry.op, type: firstError.entry.type, id: firstError.entry.id },
    });
    return;
  }

  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    for (const { result } of validations) {
      if (!result.ok) continue; // unreachable — we returned above; satisfies TS narrowing
      const { sql } = buildUpsertSql(result.table, result.columns);
      await client.query(sql, result.values);
    }

    await client.query('COMMIT');
    res.json({ ok: true, applied: entries.length });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    console.error('[api] upload failed:', err);
    res.status(500).json({ ok: false, error: 'upload failed' });
  } finally {
    if (client) client.release();
  }
});

export { router as uploadRouter };

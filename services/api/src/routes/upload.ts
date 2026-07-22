// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.

import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { requireUser, type AuthedRequest } from '../middleware/auth.js';
import { fanOutAnnouncement } from '../push/fanOut.js';
import { getPushSender } from '../push/sender.js';

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
const KNOWN_TABLES = new Set([
  'households',
  'user_households',
  'pantry_items',
  'shopping_list_items',
  'favorite_recipes',
  'activity_events',
  'announcements',
  'announcement_reactions',
  'push_tokens',
]);

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
  user_households: ['id', 'user_id', 'household_id', 'role', 'display_name'],
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
    'fill_level',
  ],
  shopping_list_items: [
    'id',
    'household_id',
    'name',
    'quantity',
    'unit',
    'note',
    'checked',
    'source',
    'added_by',
    'added_at',
    'run_id',
    'updated_at',
    'deleted',
  ],
  favorite_recipes: [
    'id',
    'household_id',
    'recipe_id',
    'title',
    'image',
    'ready_minutes',
    'health_score',
    'payload',
    'added_by',
    'added_at',
    'updated_at',
    'deleted',
  ],
  activity_events: [
    'id',
    'household_id',
    'kind',
    'ref_id',
    'label',
    'quantity',
    'unit',
    'image',
    'meta',
    'occurred_at',
    'added_by',
    'updated_at',
    'deleted',
  ],
  announcements: [
    'id',
    'household_id',
    'kind',
    'created_by',
    'created_at',
    'status',
    'departs_at',
    'message',
    'recipe_id',
    'recipe_title',
    'image',
    'updated_at',
    'deleted',
    // NOTE: runner_summary_sent_at is server-only — deliberately NOT accepted
    // from the client, so a device can't suppress the batched runner ping.
  ],
  announcement_reactions: [
    'id',
    'announcement_id',
    'household_id',
    'user_id',
    'reaction',
    'created_at',
    'updated_at',
    'deleted',
  ],
  push_tokens: [
    'id',
    'user_id',
    'token',
    'platform',
    'announcements_enabled',
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
  shopping_list_items: ['added_by'],
  favorite_recipes: ['added_by'],
  activity_events: ['added_by'],
  announcements: ['created_by'],
  announcement_reactions: ['user_id'],
  push_tokens: ['user_id'],
};

// Editable columns for a PATCH, per table. Everything else is immutable
// post-insert: id / household_id / added_by / source / added_at can never be
// reassigned, so attempting to set one is a 400 (not a silent drop) — a client
// trying to move an item between households or rewrite provenance is a bug or
// an attack, and we want it loud. `deleted` is present because mobile "delete"
// is a tombstone (UPDATE deleted = 1), not a row removal.
// pantry_items history: `unit` joined with quantity-units (July 2026); `brand`
// with the brand field; `fill_level` with the fill-level feature (range is
// DB-CHECK-guarded by migration 0001). shopping_list_items joined with the
// August shopping-list arc (`checked` is the check-off toggle).
// favorite_recipes + activity_events (June 2026, Favorites/History arc) are
// immutable snapshots/events: the only legal PATCH is the deleted tombstone
// (favorites un-save / re-save flips it; a history row can be removed).
const PATCH_ALLOWED_BY_TABLE: Record<string, ReadonlySet<string>> = {
  pantry_items: new Set([
    'name',
    'brand',
    'quantity',
    'unit',
    'location',
    'expires_at',
    'deleted',
    'updated_at',
    'fill_level',
  ]),
  shopping_list_items: new Set([
    'name',
    'quantity',
    'unit',
    'note',
    'checked',
    'run_id',
    'deleted',
    'updated_at',
  ]),
  favorite_recipes: new Set(['deleted', 'updated_at']),
  activity_events: new Set(['deleted', 'updated_at']),
  // user_households is otherwise write-once; the only legal edit is renaming
  // your OWN membership (display_name). Per-row tenancy (caller must own the
  // row) is enforced in handlePatchPantryItem — household membership alone is
  // NOT enough, or you could rename a co-member.
  user_households: new Set(['display_name']),
  announcements: new Set(['status', 'deleted', 'updated_at']),
  announcement_reactions: new Set(['reaction', 'deleted', 'updated_at']),
  push_tokens: new Set(['announcements_enabled', 'token', 'deleted', 'updated_at']),
};

// Carries an HTTP status alongside the message so the route can translate a
// failure deep inside the transaction (e.g. tenancy 403, row-not-found 404)
// into the right response code instead of a blanket 500.
export class UploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/**
 * Applies a single PATCH op inside an already-open transaction, for any table
 * with a PATCH_ALLOWED_BY_TABLE entry (pantry_items, shopping_list_items,
 * favorite_recipes, activity_events — all household-scoped with identical
 * tenancy shape).
 *
 * Edit AND delete both arrive here: delete is just a PATCH with deleted = 1
 * (tombstone). Order of checks matters — shape/allowlist (400) before any IO,
 * then existence (404), then tenancy (403), then the parameterized UPDATE.
 *
 * Tenancy mirrors the PUT path's intent but can't be done purely: a PATCH
 * payload only carries the columns being changed, never household_id (it's
 * immutable + forbidden), so we must read the target row to learn which
 * household it belongs to and confirm the caller is a member. Without this a
 * user could edit another household's rows by spoofing ids.
 *
 * Idempotent: re-applying the same payload sets the same values, so a PowerSync
 * retry of an already-applied op doesn't drift state.
 *
 * Name note: kept as handlePatchPantryItem (its original single-table name)
 * so existing imports/tests stay stable; rename to handlePatch at the ADR-008
 * NestJS promotion.
 */
export async function handlePatchPantryItem(
  entry: CrudEntry,
  userId: string,
  client: PoolClient,
): Promise<void> {
  const allowed = PATCH_ALLOWED_BY_TABLE[entry.type];
  if (!allowed) {
    throw new UploadError(400, `PATCH not supported for table "${entry.type}"`);
  }
  // entry.type is allowlist-validated above — never raw user input in SQL.
  const table = entry.type;

  const data = entry.data ?? {};
  const columns = Object.keys(data);
  if (columns.length === 0) {
    throw new UploadError(400, 'PATCH data must set at least one column');
  }
  for (const col of columns) {
    if (!allowed.has(col)) {
      // Message kept byte-identical to the single-table era — wire tests
      // assert on it.
      throw new UploadError(400, `column "${col}" is not editable via PATCH`);
    }
  }

  if (table === 'user_households') {
    // Membership rows are mutable only for display_name, and only on the
    // caller's OWN row — household membership is NOT sufficient (it would let
    // any member rename a co-member). Tenancy is the row's user_id, not its
    // household.
    const own = await client.query('SELECT user_id FROM user_households WHERE id = $1', [entry.id]);
    if ((own.rowCount ?? 0) === 0) {
      throw new UploadError(404, `${table} row "${entry.id}" not found`);
    }
    if (own.rows[0]?.user_id !== userId) {
      throw new UploadError(
        403,
        `tenancy: user_households row "${entry.id}" is not the caller's own membership`,
      );
    }
  } else if (table === 'push_tokens') {
    // push_tokens has no household_id — tenancy is the row's user_id. Only
    // the token's owner can edit it (toggle enabled, refresh token, tombstone).
    const own = await client.query('SELECT user_id FROM push_tokens WHERE id = $1', [entry.id]);
    if ((own.rowCount ?? 0) === 0) {
      throw new UploadError(404, `${table} row "${entry.id}" not found`);
    }
    if (own.rows[0]?.user_id !== userId) {
      throw new UploadError(403, `tenancy: push_tokens row "${entry.id}" is not the caller's`);
    }
  } else {
    const found = await client.query(`SELECT household_id FROM ${table} WHERE id = $1`, [
      entry.id,
    ]);
    if ((found.rowCount ?? 0) === 0) {
      throw new UploadError(404, `${table} row "${entry.id}" not found`);
    }
    const householdId = found.rows[0]?.household_id;

    const member = await client.query(
      'SELECT 1 FROM user_households WHERE user_id = $1 AND household_id = $2',
      [userId, householdId],
    );
    if ((member.rowCount ?? 0) === 0) {
      throw new UploadError(403, `tenancy: item "${entry.id}" is not in one of the caller's households`);
    }
  }

  // Dynamic but fully parameterized: table + column names come from the
  // allowlists above (never user input), values are bound. `id` is last.
  const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
  const values = columns.map((col) => data[col]);
  await client.query(`UPDATE ${table} SET ${setClause} WHERE id = $${columns.length + 1}`, [
    ...values,
    entry.id,
  ]);
}

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

  // This validator is the PUT (insert-or-replace) path only. PATCH has its own
  // handler (handlePatchPantryItem) because its tenancy check requires reading
  // the target row; DELETE is unsupported (deletes are PATCH tombstones).
  if (entry.op !== 'PUT') {
    return { ok: false, error: `validateCrudEntry handles PUT only; got "${entry.op}"` };
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

/**
 * The single write-authorization chokepoint for the PUT/upsert path.
 *
 * validateCrudEntry only proves a user-id-shaped column equals the JWT sub —
 * it does NOT prove the caller belongs to the `household_id` being written. So
 * without this gate, a crafted client could PUT (upsert) rows into ANY
 * household by supplying a foreign household_id: pantry/shopping/favorite/
 * activity/announcement rows, a `households` row overwriting another household's
 * ownership metadata via ON CONFLICT, or a `user_households` row self-joining
 * any household as owner (bypassing the guarded /household/accept invite flow).
 *
 * Every PUT passes through here, and the check is driven by the *presence of a
 * household_id column* rather than a per-table allowlist: a future
 * household-scoped table added to ALLOWED_COLUMNS is authorized automatically,
 * and one that reaches here with no household dimension and no explicit
 * exemption fails loud rather than silently skipping the gate. The PATCH path
 * enforces the same membership invariant in handlePatchPantryItem (it reads the
 * target row to learn its household).
 *
 * `ownedHouseholdIds` is the set of household ids created by a `households` PUT
 * earlier in the same batch (validateCrudEntry already forced their created_by
 * to equal the caller), so the bootstrap flow — ensureDefaultHousehold writes a
 * households row + an owner user_households row in one transaction — is permitted
 * without a round-trip, regardless of intra-batch order.
 */
export async function authorizePutWrite(
  table: string,
  columns: string[],
  values: unknown[],
  userId: string,
  client: PoolClient,
  ownedHouseholdIds: ReadonlySet<string>,
): Promise<void> {
  // push_tokens is user-scoped, not household-scoped (user_id === caller is
  // enforced in validateCrudEntry); there is no household dimension to check.
  if (table === 'push_tokens') return;

  if (table === 'households') {
    // A households PUT is an upsert on id. Creating a NEW household is the
    // bootstrap case (created_by === caller is enforced upstream). But updating
    // an EXISTING household must be restricted to its members — otherwise
    // ON CONFLICT DO UPDATE lets any client rewrite another household's name /
    // created_by by guessing its (non-secret) id.
    const householdId = values[columns.indexOf('id')];
    const existing = await client.query<{ created_by: string; member: string | null }>(
      `SELECT h.created_by, m.user_id AS member
         FROM households h
         LEFT JOIN user_households m ON m.household_id = h.id AND m.user_id = $2
        WHERE h.id = $1`,
      [householdId, userId],
    );
    if ((existing.rowCount ?? 0) === 0) return; // brand-new household — caller is creating their own
    const row = existing.rows[0];
    if (row && (row.member !== null || row.created_by === userId)) return;
    throw new UploadError(
      403,
      `tenancy: cannot overwrite household "${String(householdId)}" — caller is not a member`,
    );
  }

  const hidIdx = columns.indexOf('household_id');
  if (hidIdx === -1) {
    // Every remaining writable table is household-scoped by design. Reaching
    // here without a household_id means a new table was added to ALLOWED_COLUMNS
    // with neither a household dimension nor an exemption above — refuse rather
    // than let the tenancy gate be silently bypassed.
    throw new UploadError(
      400,
      `table "${table}" has no household_id to authorize the write against`,
    );
  }
  const householdId = values[hidIdx];

  if (table === 'user_households') {
    // Membership rows may only be PUT for a household the caller CREATED (the
    // bootstrap owner-membership). Joining an existing household, or
    // self-promoting to owner within one, must go through the guarded
    // /household/accept flow — never the open sync path.
    if (typeof householdId === 'string' && ownedHouseholdIds.has(householdId)) return;
    const owned = await client.query<{ created_by: string }>(
      'SELECT created_by FROM households WHERE id = $1',
      [householdId],
    );
    if (owned.rows[0]?.created_by === userId) return;
    throw new UploadError(
      403,
      'tenancy: a user_households row may only be PUT for a household you created; ' +
        'join an existing household via /household/accept',
    );
  }

  // All other household-scoped tables: the caller must belong to the household.
  const member = await client.query(
    'SELECT 1 FROM user_households WHERE user_id = $1 AND household_id = $2',
    [userId, householdId],
  );
  if ((member.rowCount ?? 0) === 0) {
    throw new UploadError(
      403,
      `tenancy: not a member of household "${String(householdId)}" (table "${table}")`,
    );
  }
}

router.post('/sync/upload', requireUser, async (req, res) => {
  const parsed = UploadPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid payload', issues: parsed.error.issues });
    return;
  }

  const userId = (req as AuthedRequest).userId;
  const entries = parsed.data.crud;

  // Plan the whole batch before touching Postgres, preserving entry order (a
  // PUT-then-PATCH on the same row must apply in sequence). PUT validation is
  // pure, so its failures reject the batch here with a 400. PATCH tenancy needs
  // to read the target row, so it's deferred into the transaction below. DELETE
  // is unsupported on purpose — mobile deletes are PATCH tombstones (deleted=1).
  type PlannedOp =
    | { op: 'PUT'; table: string; columns: string[]; values: unknown[] }
    | { op: 'PATCH'; entry: CrudEntry };
  const plan: PlannedOp[] = [];
  const announcementPuts: Record<string, unknown>[] = [];
  // Household ids created by a `households` PUT in this batch. validateCrudEntry
  // already forced their created_by to equal the caller, so these are the
  // caller's own new households — used by authorizePutWrite to permit the
  // bootstrap owner-membership without a DB round-trip.
  const ownedHouseholdIds = new Set<string>();
  for (const entry of entries) {
    if (entry.op === 'PUT') {
      const result = validateCrudEntry(entry, userId);
      if (!result.ok) {
        res.status(400).json({
          ok: false,
          error: result.error,
          offendingEntry: { op: entry.op, type: entry.type, id: entry.id },
        });
        return;
      }
      plan.push({ op: 'PUT', table: result.table, columns: result.columns, values: result.values });
      if (result.table === 'households') {
        const idIdx = result.columns.indexOf('id');
        if (idIdx !== -1) ownedHouseholdIds.add(String(result.values[idIdx]));
      }
      if (result.table === 'announcements') {
        const rowObj: Record<string, unknown> = {};
        result.columns.forEach((c, i) => (rowObj[c] = result.values[i]));
        announcementPuts.push(rowObj);
      }
    } else if (entry.op === 'PATCH') {
      plan.push({ op: 'PATCH', entry });
    } else {
      res.status(400).json({
        ok: false,
        error: `op "${entry.op}" not supported — deletes are modeled as PATCH tombstones (deleted = 1)`,
        offendingEntry: { op: entry.op, type: entry.type, id: entry.id },
      });
      return;
    }
  }

  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    for (const op of plan) {
      if (op.op === 'PUT') {
        await authorizePutWrite(op.table, op.columns, op.values, userId, client, ownedHouseholdIds);
        const { sql } = buildUpsertSql(op.table, op.columns);
        await client.query(sql, op.values);
      } else {
        await handlePatchPantryItem(op.entry, userId, client);
      }
    }

    await client.query('COMMIT');

    // Fan-out is best-effort and MUST NOT block or fail the upload — the synced
    // row is the source of truth, the push is a convenience. Fire-and-forget.
    for (const rowObj of announcementPuts) {
      void fanOutAnnouncement(rowObj as any, { pg: pool, sender: getPushSender() }).catch((err) =>
        console.error('[api] announcement fan-out failed:', err),
      );
    }

    res.json({ ok: true, applied: entries.length });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof UploadError) {
      res.status(err.status).json({ ok: false, error: err.message });
      return;
    }
    console.error('[api] upload failed:', err);
    res.status(500).json({ ok: false, error: 'upload failed' });
  } finally {
    if (client) client.release();
  }
});

export { router as uploadRouter };

// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.
//    Reason: PowerSync write path until backend architecture is decided.
//    Tracking: docs/DECISIONS.md ADR-008.
//
// Shared Household PR A: invite-code mechanism. Two endpoints registered on
// the same Express app as /sync/upload — pragmatic ADR-008 path. NestJS
// promotion deferred to a deliberate post-Shared-Household consolidation PR.

import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { requireUser, type AuthedRequest } from '../middleware/auth.js';
import { generateInviteCode, isValidInviteCode } from '../lib/inviteCode.js';

const router: ReturnType<typeof Router> = Router();

// RFC 4122 UUID (any version). The /sync/upload route doesn't strictly
// validate this either, but here we use it for early rejection before
// touching the database.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const InviteBodySchema = z.object({
  household_id: z.string().regex(UUID_REGEX, 'household_id must be a UUID'),
});

const AcceptBodySchema = z.object({
  invite_code: z.string().min(1),
});

// pg's unique-violation SQLSTATE. We treat any INSERT failure with this code on
// the invite_code column as a collision and retry the generator.
const PG_UNIQUE_VIOLATION = '23505';

// Generator retry budget. The keyspace (20 words × 33^4 ≈ 23.8M) makes
// collisions vanishingly rare; 5 attempts is purely defensive against a
// pathological run, not an expected hot path.
const MAX_INVITE_GENERATION_ATTEMPTS = 5;

interface HouseholdInviteRow {
  id: string;
  household_id: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
}

router.post('/household/invite', requireUser, async (req, res) => {
  const parsed = InviteBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: 'invalid payload',
      issues: parsed.error.issues,
    });
    return;
  }

  const userId = (req as AuthedRequest).userId;
  const { household_id } = parsed.data;

  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Membership check: only existing members may generate invites for a
    // household. Prevents random JWTs from probing the table.
    const membership = await client.query<{ id: string }>(
      'SELECT id FROM user_households WHERE user_id = $1 AND household_id = $2 LIMIT 1',
      [userId, household_id],
    );
    if (membership.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({ ok: false, error: 'not a member of this household' });
      return;
    }

    // Retry on UNIQUE collision. We let the DB enforce uniqueness (single
    // source of truth) instead of pre-checking + racing.
    let inserted: HouseholdInviteRow | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_INVITE_GENERATION_ATTEMPTS; attempt++) {
      const code = generateInviteCode();
      try {
        const result = await client.query<HouseholdInviteRow>(
          `INSERT INTO household_invites (household_id, invite_code, created_by)
           VALUES ($1, $2, $3)
           RETURNING id, household_id, invite_code, created_by,
                     created_at, expires_at, used_at, used_by`,
          [household_id, code, userId],
        );
        inserted = result.rows[0] ?? null;
        break;
      } catch (err) {
        lastError = err;
        if (isUniqueViolation(err)) {
          continue; // try a fresh code
        }
        throw err; // genuine failure — bubble to outer catch
      }
    }

    if (!inserted) {
      await client.query('ROLLBACK');
      console.error('[api] invite generation exhausted retries:', lastError);
      res.status(500).json({ ok: false, error: 'could not generate unique code' });
      return;
    }

    await client.query('COMMIT');
    res.status(200).json({
      invite_code: inserted.invite_code,
      expires_at: inserted.expires_at,
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    console.error('[api] /household/invite failed:', err);
    res.status(500).json({ ok: false, error: 'invite creation failed' });
  } finally {
    if (client) client.release();
  }
});

router.post('/household/accept', requireUser, async (req, res) => {
  const parsed = AcceptBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid payload', issues: parsed.error.issues });
    return;
  }
  const { invite_code } = parsed.data;
  if (!isValidInviteCode(invite_code)) {
    res.status(400).json({ ok: false, error: 'malformed invite code' });
    return;
  }

  const userId = (req as AuthedRequest).userId;

  let client: PoolClient | null = null;
  try {
    client = await pool.connect();

    // Lookup BEFORE the transaction — the precondition checks (used? expired?
    // already a member?) are read-only and benefit from short-circuiting
    // without holding a write transaction open.
    const inviteResult = await client.query<HouseholdInviteRow>(
      `SELECT id, household_id, invite_code, created_by,
              created_at, expires_at, used_at, used_by
       FROM household_invites
       WHERE invite_code = $1`,
      [invite_code],
    );
    const invite = inviteResult.rows[0];
    if (!invite) {
      res.status(404).json({ ok: false, error: 'invite not found' });
      return;
    }
    if (invite.used_at !== null) {
      res.status(409).json({ ok: false, error: 'invite already used' });
      return;
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      res.status(410).json({ ok: false, error: 'invite expired' });
      return;
    }

    const alreadyMember = await client.query<{ id: string }>(
      'SELECT id FROM user_households WHERE user_id = $1 AND household_id = $2 LIMIT 1',
      [userId, invite.household_id],
    );
    if (alreadyMember.rowCount && alreadyMember.rowCount > 0) {
      res.status(409).json({ ok: false, error: 'already a member' });
      return;
    }

    // Mutation phase: membership insert + invite-used update happen atomically
    // so a crash mid-way can't leave a "used" code without a matching member.
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO user_households (user_id, household_id, role)
         VALUES ($1, $2, 'member')`,
        [userId, invite.household_id],
      );

      // Guard against TOCTOU: another concurrent /accept could have marked
      // this invite used between our SELECT and this UPDATE. The
      // `used_at IS NULL` predicate makes the UPDATE a no-op in that case,
      // and we treat 0 rows affected as a 409.
      const updateResult = await client.query(
        `UPDATE household_invites
         SET used_at = NOW(), used_by = $1
         WHERE id = $2 AND used_at IS NULL`,
        [userId, invite.id],
      );
      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(409).json({ ok: false, error: 'invite already used' });
        return;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      // Membership-uniqueness collision = the user just became a member via
      // another concurrent path. Surface that as the same 409 the pre-check
      // would have produced.
      if (isUniqueViolation(err)) {
        res.status(409).json({ ok: false, error: 'already a member' });
        return;
      }
      throw err;
    }

    res.status(200).json({ household_id: invite.household_id });
  } catch (err) {
    console.error('[api] /household/accept failed:', err);
    res.status(500).json({ ok: false, error: 'accept failed' });
  } finally {
    if (client) client.release();
  }
});

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

export { router as householdRouter };

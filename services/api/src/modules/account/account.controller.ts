/**
 * AccountController — native NestJS, the first module on the promoted backend.
 *
 * DELETE /account: the store-gate requirement (App Store + Play). Cascade:
 *   1. Tombstone pantry_items where added_by = user
 *   2. Tombstone shopping_list_items where added_by = user
 *   3. Tombstone the user's attribution rows across the remaining household
 *      tables (favorite_recipes, activity_events, announcements,
 *      announcement_reactions) so no live row still attributes content to a
 *      deleted account
 *   4. Tombstone push_tokens where user_id = user — the sender filters
 *      deleted = FALSE, so this is what actually stops a deleted user's devices
 *      from receiving household pushes
 *   5. Revoke household_invites created_by user (set used_at = NOW)
 *   6. Remove from user_households
 *   7. Orphan policy for owned households: if other members exist, transfer
 *      ownership to the longest-tenured; if sole member, keep alive ownerless
 *      (recoverable, per locked decision)
 *   8. Delete the Supabase auth user via the admin API
 *
 * Idempotent: calling DELETE /account on an already-deleted user returns 200
 * (the Supabase admin delete is a no-op for missing users). The client signs
 * out after a successful response; the auth state flip unmounts AppStack.
 */
import {
  Controller,
  Delete,
  HttpCode,
  HttpException,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { pool } from '../../db.js';
import { requireUser, type AuthedRequest } from '../../middleware/auth.js';

// Supabase admin API — requires the service-role key (server-side only,
// never in the client bundle). The SUPABASE_URL is the same one the mobile
// client uses; the service-role key is a separate secret.
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

@Controller()
export class AccountController {
  @Delete('account')
  @HttpCode(200)
  async deleteAccount(@Req() req: Request): Promise<{ ok: true; deleted: string }> {
    // Auth: reuse the existing Express middleware inline (the guard migration
    // is a future incremental step — this works today and the test mock
    // pattern stays identical).
    await new Promise<void>((resolve, reject) => {
      requireUser(req, req.res!, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
    const userId = (req as AuthedRequest).userId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Tombstone the user's pantry items.
      await client.query(
        'UPDATE pantry_items SET deleted = true, updated_at = $1 WHERE added_by = $2 AND deleted = false',
        [Date.now(), userId],
      );

      // 2. Tombstone the user's shopping list items.
      await client.query(
        'UPDATE shopping_list_items SET deleted = true, updated_at = $1 WHERE added_by = $2 AND deleted = false',
        [Date.now(), userId],
      );

      // 3. Tombstone the user's attribution rows across the remaining
      //    household tables. Without this, favorites/history/announcements/
      //    reactions keep the deleted user's id as live attribution. Each
      //    UPDATE is keyed on that table's user-id column (added_by /
      //    created_by / user_id) and updated_at is the client-style epoch-ms
      //    the sync model uses everywhere else.
      const now = Date.now();
      await client.query(
        'UPDATE favorite_recipes SET deleted = true, updated_at = $1 WHERE added_by = $2 AND deleted = false',
        [now, userId],
      );
      await client.query(
        'UPDATE activity_events SET deleted = true, updated_at = $1 WHERE added_by = $2 AND deleted = false',
        [now, userId],
      );
      await client.query(
        'UPDATE announcements SET deleted = true, updated_at = $1 WHERE created_by = $2 AND deleted = false',
        [now, userId],
      );
      await client.query(
        'UPDATE announcement_reactions SET deleted = true, updated_at = $1 WHERE user_id = $2 AND deleted = false',
        [now, userId],
      );

      // 4. Tombstone the user's push tokens. fanOut selects on
      //    `deleted = FALSE`, so flipping the flag is what actually stops the
      //    deleted user's devices from receiving household pushes.
      await client.query(
        'UPDATE push_tokens SET deleted = true, updated_at = $1 WHERE user_id = $2 AND deleted = false',
        [now, userId],
      );

      // 5. Revoke any outstanding invites the user created (mark as used so
      //    they can't be accepted after the account is gone). `used_by` is a
      //    UUID column (Supabase auth.users.id) with no sentinel value — a
      //    non-UUID literal like 'deleted' fails uuid coercion at query-parse
      //    time and 500s the whole cascade. used_at alone marks the code spent.
      await client.query(
        'UPDATE household_invites SET used_at = NOW() WHERE created_by = $1 AND used_at IS NULL',
        [userId],
      );

      // 6 + 7. For each household the user is a member of:
      //   - If they're the owner and other members exist → transfer ownership
      //     to the longest-tenured remaining member.
      //   - If they're the sole member → keep the household alive, ownerless
      //     (recoverable per locked decision — no data destroyed).
      //   - Remove the user's membership row.
      const memberships = await client.query<{ household_id: string; role: string }>(
        'SELECT household_id, role FROM user_households WHERE user_id = $1',
        [userId],
      );

      for (const row of memberships.rows) {
        if (row.role === 'owner') {
          // Find the longest-tenured non-owner member to transfer to.
          const successor = await client.query<{ user_id: string }>(
            `SELECT user_id FROM user_households
             WHERE household_id = $1 AND user_id != $2
             ORDER BY created_at ASC
             LIMIT 1`,
            [row.household_id, userId],
          );
          if (successor.rows[0]) {
            await client.query(
              "UPDATE user_households SET role = 'owner' WHERE user_id = $1 AND household_id = $2",
              [successor.rows[0].user_id, row.household_id],
            );
          }
          // If no successor → household stays ownerless (recoverable).
        }
        // Remove the user's membership.
        await client.query(
          'DELETE FROM user_households WHERE user_id = $1 AND household_id = $2',
          [userId, row.household_id],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('[api] account deletion cascade failed:', err);
      throw new HttpException(
        { ok: false, error: 'account deletion failed' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      client.release();
    }

    // 8. Delete the Supabase auth user. This is outside the DB transaction
    //    because it's a separate HTTP call to the Supabase admin API. If it
    //    fails after the cascade committed, the DB data is already tombstoned
    //    and the auth user is orphaned — recoverable by retrying this call.
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
          },
        });
        // 404 = user already deleted (idempotent). Anything else non-ok is a
        // warning, not a failure — the cascade already ran.
        if (!res.ok && res.status !== 404) {
          console.warn('[api] supabase auth user delete failed:', res.status, await res.text());
        }
      } catch (err) {
        console.warn('[api] supabase auth user delete network error:', err);
      }
    } else {
      console.warn('[api] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — auth user not deleted');
    }

    return { ok: true, deleted: userId };
  }
}

/**
 * AccountController — native NestJS, the first module on the promoted backend.
 *
 * DELETE /account: the store-gate requirement (App Store + Play). Cascade:
 *   1. Tombstone + anonymize the user's rows in every household table
 *      (pantry, shopping, favorites, activity, announcements, reactions): the
 *      attribution column is overwritten with the nil UUID, so no row keeps
 *      the deleted user's id
 *   2. Delete the user's push tokens
 *   3. Delete invites the user created; detach them from invites they used
 *   4. Detach first-party analytics_events from the account
 *   5. Remove from user_households, transferring ownership to the
 *      longest-tenured remaining member (sole-member households stay alive,
 *      ownerless — recoverable, per locked decision)
 *   6. Delete the Supabase auth user via the admin API
 *
 * The endpoint only returns 200 when the auth user is really gone: it refuses
 * up front (503) when the admin credentials are missing and fails (502) when
 * the admin call fails.
 *
 * Idempotent: calling DELETE /account on an already-deleted user returns 200
 * (the Supabase admin delete answers 404 for missing users, which counts). The client signs
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

// Nil UUID: the "nobody" author written over a deleted user's id.
const ANONYMOUS_USER_ID = '00000000-0000-0000-0000-000000000000';

// Every household-scoped table and the column that attributes a row to a user.
const ATTRIBUTION_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['pantry_items', 'added_by'],
  ['shopping_list_items', 'added_by'],
  ['favorite_recipes', 'added_by'],
  ['activity_events', 'added_by'],
  ['announcements', 'created_by'],
  ['announcement_reactions', 'user_id'],
];

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

    // Refuse BEFORE touching any data if the auth user can't be deleted
    // afterwards. Otherwise the cascade would strip the user's data and the
    // endpoint would report success while the sign-in still works — which is
    // not an account deletion (and fails the App Store / Play requirement).
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[api] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — refusing account deletion');
      throw new HttpException(
        { ok: false, error: 'account deletion is not available right now' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const now = Date.now();

      // 1-3. Tombstone AND anonymize the user's rows in every household table.
      //    The tombstone hides the row from co-members (the sync model's
      //    delete); rewriting the attribution column to the nil UUID is what
      //    makes the removal real — no row keeps the deleted user's id. No
      //    `deleted = false` filter: rows the user tombstoned earlier still
      //    carry their id and must be scrubbed too.
      for (const [table, col] of ATTRIBUTION_COLUMNS) {
        await client.query(
          `UPDATE ${table} SET deleted = true, ${col} = $1, updated_at = $2 WHERE ${col} = $3`,
          [ANONYMOUS_USER_ID, now, userId],
        );
      }

      // 4. Remove the user's push tokens outright — device secrets with no
      //    reason to outlive the account, and what stops a deleted user's
      //    devices from receiving household pushes.
      await client.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);

      // 5. Remove invites the user created (they can't be accepted once the
      //    account is gone) and detach the user from invites they accepted.
      await client.query('DELETE FROM household_invites WHERE created_by = $1', [userId]);
      await client.query('UPDATE household_invites SET used_by = NULL WHERE used_by = $1', [userId]);

      // 6. Detach first-party analytics from the account. The events stay as
      //    anonymous install-level rows.
      await client.query('UPDATE analytics_events SET user_id = NULL WHERE user_id = $1', [userId]);

      // 7 + 8. For each household the user is a member of:
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

      // 9. households.created_by still names the user. Hand it to the
      //    household's current owner, or the nil UUID when nobody is left.
      await client.query(
        `UPDATE households h
            SET created_by = COALESCE(
              (SELECT m.user_id FROM user_households m
                WHERE m.household_id = h.id AND m.role = 'owner'
                ORDER BY m.created_at ASC LIMIT 1),
              $1::uuid)
          WHERE h.created_by = $2`,
        [ANONYMOUS_USER_ID, userId],
      );

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

    // 10. Delete the Supabase auth user. This is outside the DB transaction
    //    because it's a separate HTTP call to the Supabase admin API. If it
    //    fails the account still exists, so the request FAILS (502) — the
    //    cascade above is idempotent, so the client can simply retry.
    let authDeleted = false;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
        },
      });
      // 404 = user already deleted (idempotent).
      authDeleted = res.ok || res.status === 404;
      if (!authDeleted) {
        console.error('[api] supabase auth user delete failed:', res.status, await res.text());
      }
    } catch (err) {
      console.error('[api] supabase auth user delete network error:', err);
    }
    if (!authDeleted) {
      throw new HttpException(
        {
          ok: false,
          error: 'your data was removed but the sign-in could not be deleted — please try again',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    return { ok: true, deleted: userId };
  }
}

/**
 * Push fan-out for household announcements. Decoupled from the upload-proxy
 * internals (takes injected pg + sender) so it survives the ADR-008 backend
 * swap and stays unit-testable. Called AFTER the announcement row commits.
 */
import {
  recipientUserIds,
  announcementPushBody,
  isRunnerSummaryDue,
  runnerSummaryBody,
  type AnnouncementKind,
} from './announcementsCore.js';
import type { PushSender } from './expoClient.js';

interface PgLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface FanOutDeps {
  pg: PgLike;
  sender: PushSender;
}

interface AnnouncementRow {
  id: string;
  household_id: string;
  kind: AnnouncementKind;
  created_by: string;
  message?: string | null;
  departs_at?: string | null;
  recipe_title?: string | null;
  recipe_id?: string | null;
}

export async function fanOutAnnouncement(row: AnnouncementRow, deps: FanOutDeps): Promise<void> {
  const { pg, sender } = deps;

  // Stale-queue guard: an announcement synced from a device that was offline for
  // more than an hour shouldn't fire late pushes (usually a duplicate at best,
  // confusing at worst).
  const departsAt = row.departs_at ? new Date(row.departs_at).getTime() : null;
  if (row.kind === 'shopping_run' && departsAt) {
    const hoursSinceDeparture = (Date.now() - departsAt) / 3_600_000;
    if (hoursSinceDeparture > 1) return;
  }

  // Members at send time (departed members excluded). display_name for copy.
  const members = await pg.query(
    'SELECT user_id, display_name FROM user_households WHERE household_id = $1',
    [row.household_id],
  );
  const memberIds = members.rows.map((r) => r.user_id as string);
  const senderName =
    members.rows.find((r) => r.user_id === row.created_by)?.display_name ?? 'A housemate';

  const recipients = recipientUserIds(memberIds, row.created_by);
  if (recipients.length === 0) return;

  const tokenRows = await pg.query(
    `SELECT token, user_id FROM push_tokens
     WHERE user_id = ANY($1) AND deleted = FALSE AND announcements_enabled = TRUE`,
    [recipients],
  );
  if (tokenRows.rows.length === 0) return;

  const body = announcementPushBody(
    {
      kind: row.kind,
      message: row.message ?? undefined,
      departsAt: row.departs_at ?? undefined,
      recipeTitle: row.recipe_title ?? undefined,
    },
    senderName,
  );

  const results = await sender.send(
    tokenRows.rows.map((t) => ({
      to: t.token as string,
      title: body.title,
      body: body.body,
      data: {
        announcementId: row.id,
        kind: row.kind,
        householdId: row.household_id,
        ...(row.kind === 'cooking' && row.recipe_id ? { recipeId: row.recipe_id } : {}),
      },
    })),
  );

  const dead = results.filter((r) => r.deviceNotRegistered).map((r) => r.to);
  if (dead.length > 0) {
    await pg.query(
      'UPDATE push_tokens SET deleted = TRUE, updated_at = $1 WHERE token = ANY($2)',
      [Date.now(), dead],
    );
  }
}

/**
 * Finds active runs due for their one batched runner ping and sends it. Idempotent
 * per row via runner_summary_sent_at, which is claimed (stamped) BEFORE the send
 * so overlapping ticks / multiple instances can't double-send. Called on an interval.
 */
export async function sweepRunnerSummaries(deps: FanOutDeps, now: Date = new Date()): Promise<void> {
  const { pg, sender } = deps;
  const candidates = await pg.query(
    `SELECT a.id, a.household_id, a.created_by, a.departs_at, a.status,
            a.runner_summary_sent_at,
            (SELECT COUNT(*) FROM shopping_list_items s
               WHERE s.run_id = a.id AND s.deleted = FALSE) AS requested_count,
            (SELECT COUNT(DISTINCT s.added_by) FROM shopping_list_items s
               WHERE s.run_id = a.id AND s.deleted = FALSE AND s.added_by <> a.created_by) AS housemate_count
       FROM announcements a
      WHERE a.kind = 'shopping_run' AND a.status = 'active'
        AND a.runner_summary_sent_at IS NULL AND a.deleted = FALSE`,
    [],
  );

  for (const c of candidates.rows) {
    const due = isRunnerSummaryDue(
      {
        status: c.status,
        departsAt: c.departs_at ?? undefined,
        runnerSummarySentAt: c.runner_summary_sent_at ?? null,
        requestedItemCount: Number(c.requested_count),
      },
      now,
    );
    if (!due) continue;

    // Claim the row BEFORE sending, atomically. Previously the stamp happened
    // AFTER the send, so two API instances (or two overlapping ticks) could both
    // read runner_summary_sent_at IS NULL, both send, and both stamp — a
    // duplicate runner ping. The `AND runner_summary_sent_at IS NULL` predicate
    // makes exactly one caller win (rowCount 1); everyone else gets 0 and skips.
    const claim = await pg.query(
      'UPDATE announcements SET runner_summary_sent_at = NOW() WHERE id = $1 AND runner_summary_sent_at IS NULL',
      [c.id],
    );
    if (claim.rowCount !== 1) continue;

    const tokenRows = await pg.query(
      `SELECT token FROM push_tokens
       WHERE user_id = $1 AND deleted = FALSE AND announcements_enabled = TRUE`,
      [c.created_by],
    );
    if (tokenRows.rows.length > 0) {
      await sender.send(
        tokenRows.rows.map((t) => ({
          to: t.token as string,
          title: 'Shopping list updated',
          body: runnerSummaryBody(Number(c.requested_count), Number(c.housemate_count)),
          data: { announcementId: c.id, kind: 'runner_summary' },
        })),
      );
    }
    // Already claimed above, so no trailing stamp — at-most-once is the point.
  }
}

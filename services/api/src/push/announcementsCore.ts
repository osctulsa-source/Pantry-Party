/**
 * Vendored from packages/core/src/announcements.ts — the PURE push fan-out
 * helpers, copied here on purpose.
 *
 * The production API deploys as a self-contained `services/api` (Docker root =
 * this folder only, per ADR-008 / PR #145), so it CANNOT resolve the
 * `@breadbox/core` workspace package at runtime. PR #180's fanOut.ts imported
 * from `@breadbox/core` and crash-looped prod with ERR_MODULE_NOT_FOUND. These
 * functions have no IO and no non-trivial deps, so we inline them zod-free
 * rather than reach across the workspace boundary.
 *
 * KEEP IN SYNC with packages/core/src/announcements.ts if the copy there changes
 * (recipientUserIds / announcementPushBody / isRunnerSummaryDue /
 * runnerSummaryBody / RUNNER_SUMMARY_LEAD_MS).
 */

export type AnnouncementKind = 'shopping_run' | 'cooking';
export type AnnouncementStatus = 'active' | 'done' | 'canceled';

export interface PushBody {
  title: string;
  body: string;
}

/** Household member ids minus the sender, deduped, order-preserving. */
export function recipientUserIds(
  memberUserIds: readonly string[],
  senderUserId: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of memberUserIds) {
    if (id === senderUserId || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Notification copy for the fan-out. Sender name resolved by the caller. */
export function announcementPushBody(
  a: {
    kind: AnnouncementKind;
    storeHint?: string;
    departsAt?: string;
    recipeTitle?: string;
  },
  senderName: string,
): PushBody {
  if (a.kind === 'shopping_run') {
    const where = a.storeHint ? ` to ${a.storeHint}` : '';
    return {
      title: `${senderName} is heading to the store`,
      body: `Shopping run${where}. Add anything you need to the list.`,
    };
  }
  const what = a.recipeTitle ? `: ${a.recipeTitle}` : '';
  return {
    title: `${senderName} is cooking tonight`,
    body: `Dinner's covered${what}.`,
  };
}

/** How far before departure the batched runner ping may fire. */
export const RUNNER_SUMMARY_LEAD_MS = 5 * 60_000;

/**
 * True when a run should get its one batched runner-summary push now:
 * active, not already sent, at least one requested item, and `now` within
 * the lead window before departsAt (but not past departure by more than the
 * lead — a long-offline sweep shouldn't fire a stale ping).
 */
export function isRunnerSummaryDue(
  run: {
    status: AnnouncementStatus;
    departsAt?: string;
    runnerSummarySentAt: string | null;
    requestedItemCount: number;
  },
  now: Date,
): boolean {
  if (run.status !== 'active') return false;
  if (run.runnerSummarySentAt) return false;
  if (run.requestedItemCount <= 0) return false;
  if (!run.departsAt) return false;
  const departs = new Date(run.departsAt).getTime();
  const delta = departs - now.getTime();
  return delta <= RUNNER_SUMMARY_LEAD_MS && delta >= -RUNNER_SUMMARY_LEAD_MS;
}

export function runnerSummaryBody(itemCount: number, housemateCount: number): string {
  return `${housemateCount} housemates added ${itemCount} items to the list.`;
}

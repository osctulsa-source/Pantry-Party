/**
 * Announcement — cross-user household notifications (shopping runs + cooking
 * commitments). Synced like activity_events; the upload-proxy fans out Expo
 * pushes when an INSERT commits. Reactions reach the sender via sync only.
 *
 * This module is PURE (no platform / no IO): schema + parse at the read
 * boundary, plus the window-label / recipient / batch-eligibility helpers the
 * mobile app and API both reuse. Mirrors the notifications.ts pure-reconciler
 * split — side effects live in apps/mobile and services/api.
 */
import { z } from "zod";

export const ANNOUNCEMENT_KINDS = ["shopping_run", "cooking"] as const;
export const AnnouncementKind = z.enum(ANNOUNCEMENT_KINDS);
export type AnnouncementKind = z.infer<typeof AnnouncementKind>;

export const ANNOUNCEMENT_STATUSES = ["active", "done", "canceled"] as const;
export const AnnouncementStatus = z.enum(ANNOUNCEMENT_STATUSES);
export type AnnouncementStatus = z.infer<typeof AnnouncementStatus>;

export const REACTIONS = ["thumbs_up", "party", "cant_tonight"] as const;
export const Reaction = z.enum(REACTIONS);
export type Reaction = z.infer<typeof Reaction>;

export const Announcement = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  kind: AnnouncementKind,
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  status: AnnouncementStatus.default("active"),

  // shopping_run only
  departsAt: z.string().datetime().optional(),
  storeHint: z.string().max(80).optional(),

  // cooking only
  recipeId: z.string().optional(),
  recipeTitle: z.string().max(200).optional(),
  image: z.string().optional(),

  // sync bookkeeping
  updatedAt: z.number().int(),
  deleted: z.boolean().default(false),
});
export type Announcement = z.infer<typeof Announcement>;

export function parseAnnouncement(input: unknown): Announcement {
  return Announcement.parse(input);
}

export const AnnouncementReaction = z.object({
  id: z.string().uuid(),
  announcementId: z.string().uuid(),
  householdId: z.string().uuid(),
  userId: z.string(),
  reaction: Reaction,
  createdAt: z.string().datetime(),
  updatedAt: z.number().int(),
  deleted: z.boolean().default(false),
});
export type AnnouncementReaction = z.infer<typeof AnnouncementReaction>;

export function parseAnnouncementReaction(input: unknown): AnnouncementReaction {
  return AnnouncementReaction.parse(input);
}

/** Compose-sheet window options → offset minutes from "now". */
export const RUN_WINDOWS = [
  { id: "now", label: "Now", offsetMinutes: 0 },
  { id: "30min", label: "In ~30 min", offsetMinutes: 30 },
  { id: "afternoon", label: "This afternoon", offsetMinutes: 180 },
  { id: "tonight", label: "Tonight", offsetMinutes: 360 },
] as const;

export type RunWindowId = (typeof RUN_WINDOWS)[number]["id"];

/** Resolve a window id to a concrete departsAt ISO string. Pure. */
export function windowToDepartsAt(id: RunWindowId, now: Date): string {
  const win = RUN_WINDOWS.find((w) => w.id === id);
  if (!win) throw new Error(`unknown run window "${id}"`);
  return new Date(now.getTime() + win.offsetMinutes * 60_000).toISOString();
}

/** Human clock label for a departsAt, in the runtime's local timezone. */
export function formatDepartureLabel(departsAtIso: string): string {
  return new Date(departsAtIso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
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

export interface PushBody {
  title: string;
  body: string;
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
  if (a.kind === "shopping_run") {
    const where = a.storeHint ? ` to ${a.storeHint}` : "";
    return {
      title: `${senderName} is heading to the store`,
      body: `Shopping run${where}. Add anything you need to the list.`,
    };
  }
  const what = a.recipeTitle ? `: ${a.recipeTitle}` : "";
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
  if (run.status !== "active") return false;
  if (run.runnerSummarySentAt) return false;
  if (run.requestedItemCount <= 0) return false;
  if (!run.departsAt) return false;
  const departs = new Date(run.departsAt).getTime();
  const delta = departs - now.getTime();
  return delta <= RUNNER_SUMMARY_LEAD_MS && delta >= -RUNNER_SUMMARY_LEAD_MS;
}

export function runnerSummaryBody(
  itemCount: number,
  housemateCount: number,
): string {
  return `${housemateCount} housemates added ${itemCount} items to the list.`;
}

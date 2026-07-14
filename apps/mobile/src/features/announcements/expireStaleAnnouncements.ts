/**
 * Marks stale active announcements 'done' so their cards disappear: shopping
 * runs ~4h past departure, cooking announcements past end-of-day. Idempotent;
 * call on app foreground alongside the expiry reconcile.
 */
import { getPowerSync } from '../../data/powersync/db';

const RUN_TTL_MS = 4 * 60 * 60_000;

export async function expireStaleAnnouncements(householdId: string): Promise<void> {
  const db = getPowerSync();
  const now = Date.now();
  const rows = await db.getAll<{ id: string; kind: string; departs_at: string | null; created_at: string }>(
    `SELECT id, kind, departs_at, created_at FROM announcements
     WHERE household_id = ? AND status = 'active' AND deleted = 0`,
    [householdId],
  );
  for (const r of rows) {
    let expired = false;
    if (r.kind === 'shopping_run' && r.departs_at) {
      expired = new Date(r.departs_at).getTime() + RUN_TTL_MS < now;
    } else if (r.kind === 'cooking') {
      const created = new Date(r.created_at);
      const endOfDay = new Date(created);
      endOfDay.setHours(23, 59, 59, 999);
      expired = now > endOfDay.getTime();
    }
    if (expired) {
      await db.execute('UPDATE announcements SET status = ?, updated_at = ? WHERE id = ?', ['done', now, r.id]);
    }
  }
}

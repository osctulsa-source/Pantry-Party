/**
 * History date helpers — pure date-bucketing for the activity History screen,
 * lifted out of HistoryScreen so the grouping logic is unit-tested without
 * React Native. (kindMeta / KindIcon stay in the screen — they use theme
 * tokens + JSX.)
 */
import type { ActivityEvent } from './activity.ts';

/** Local calendar-day key (Y-M-D) for grouping + Today/Yesterday comparison. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** A human day label relative to `now`: Today / Yesterday / a formatted date. */
export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return 'Today';
  if (dayKey(d) === dayKey(yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Time-of-day label (e.g. "6:30 PM"). */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export interface DayGroup {
  label: string;
  events: ActivityEvent[];
}

/**
 * Group events into day buckets. Events arrive newest-first and contiguous per
 * calendar day, so a single pass that opens a new group on each label change
 * preserves order.
 */
export function groupByDay(events: ActivityEvent[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const e of events) {
    const label = dayLabel(e.occurredAt, now);
    if (!current || current.label !== label) {
      current = { label, events: [e] };
      groups.push(current);
    } else {
      current.events.push(e);
    }
  }
  return groups;
}

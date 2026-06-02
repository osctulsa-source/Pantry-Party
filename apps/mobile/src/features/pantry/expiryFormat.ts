/**
 * Human-readable expiry description for the PantryScreen meta-line.
 * Calendar-day rounded — "tomorrow" stays "tomorrow" all day, not just after midnight.
 *
 * Returns undefined when the item has no usable expiry; caller decides the fallback.
 *
 * Note: this disagrees with @breadbox/core's getExpiryStatus at fractional-day edges
 * (e.g. 3.5 days could render "Expires in 4 days" while still in 'fresh' color).
 * That's deliberate — getExpiryStatus gates the visual, formatExpiryMeta describes
 * the date in human terms. Don't try to unify them.
 */

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function formatExpiryMeta(
  item: { expiresAt?: string },
  now: Date,
): string | undefined {
  if (!item.expiresAt) return undefined;
  const expiry = new Date(item.expiresAt);
  if (Number.isNaN(expiry.getTime())) return undefined;
  const days = Math.round(
    (startOfDay(expiry).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
  if (days > 1) return `Expires in ${days} days`;
  if (days === 1) return 'Expires tomorrow';
  if (days === 0) return 'Expires today';
  if (days === -1) return 'Expired yesterday';
  return `Expired ${-days} days ago`;
}

/**
 * Expiry status predicates. Pure functions — no I/O, no globals.
 *
 * Locked decisions (Phase 2, June 2026):
 *  - Items without expiresAt are always 'fresh' (never warn, never schedule notifications).
 *  - Invalid expiresAt strings (anything Date() can't parse) treated same as undefined.
 *  - Comparison is timestamp-based, UTC. ISO date-only strings ("2026-06-05") parse as
 *    UTC midnight; this creates a sub-day skew for users in non-UTC timezones. Acceptable
 *    for v1. Revisit if user feedback surfaces "off by a day" complaints.
 */

export type ExpiryStatus = 'fresh' | 'warning' | 'expired';

export const DEFAULT_EXPIRY_WARNING_DAYS = 3;

export function getExpiryStatus(
  item: { expiresAt?: string },
  now: Date,
  warningDays: number = DEFAULT_EXPIRY_WARNING_DAYS,
): ExpiryStatus {
  if (!item.expiresAt) return 'fresh';
  const expiry = new Date(item.expiresAt);
  if (Number.isNaN(expiry.getTime())) return 'fresh';
  const msUntilExpiry = expiry.getTime() - now.getTime();
  const daysUntilExpiry = msUntilExpiry / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= warningDays) return 'warning';
  return 'fresh';
}

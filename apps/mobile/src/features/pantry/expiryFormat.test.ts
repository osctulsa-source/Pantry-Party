import { daysUntilExpiry, formatExpiryMeta } from './expiryFormat';

// A fixed reference instant. Expiry fixtures are built as NOW ± whole days at
// the SAME wall-clock time, so the calendar-day math is identical on any
// timezone/DST — both endpoints shift by the same offset (see startOfDay).
const NOW = new Date('2026-07-06T12:00:00.000Z');
const DAY_MS = 86_400_000;
const inDays = (n: number) => ({ expiresAt: new Date(NOW.getTime() + n * DAY_MS).toISOString() });

describe('formatExpiryMeta', () => {
  it('returns undefined when there is no date or the date is unparseable', () => {
    expect(formatExpiryMeta({ expiresAt: undefined }, NOW)).toBeUndefined();
    expect(formatExpiryMeta({ expiresAt: 'not-a-date' }, NOW)).toBeUndefined();
  });

  it('describes upcoming dates in human, calendar-day terms', () => {
    expect(formatExpiryMeta(inDays(0), NOW)).toBe('Expires today');
    expect(formatExpiryMeta(inDays(1), NOW)).toBe('Expires tomorrow');
    expect(formatExpiryMeta(inDays(4), NOW)).toBe('Expires in 4 days');
  });

  it('describes past dates', () => {
    expect(formatExpiryMeta(inDays(-1), NOW)).toBe('Expired yesterday');
    expect(formatExpiryMeta(inDays(-5), NOW)).toBe('Expired 5 days ago');
  });
});

describe('daysUntilExpiry', () => {
  it('returns undefined without a usable date', () => {
    expect(daysUntilExpiry({ expiresAt: undefined }, NOW)).toBeUndefined();
    expect(daysUntilExpiry({ expiresAt: 'nope' }, NOW)).toBeUndefined();
  });

  it('counts calendar days, going negative once past', () => {
    expect(daysUntilExpiry(inDays(0), NOW)).toBe(0);
    expect(daysUntilExpiry(inDays(1), NOW)).toBe(1);
    expect(daysUntilExpiry(inDays(5), NOW)).toBe(5);
    expect(daysUntilExpiry(inDays(-2), NOW)).toBe(-2);
  });
});

import { describe, expect, it } from 'vitest';
import { getExpiryStatus, DEFAULT_EXPIRY_WARNING_DAYS } from './expiry';

const NOW = new Date('2026-06-02T12:00:00Z');
const daysFromNow = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString();

describe('getExpiryStatus', () => {
  it('returns fresh for items with no expiresAt', () => {
    expect(getExpiryStatus({}, NOW)).toBe('fresh');
    expect(getExpiryStatus({ expiresAt: undefined }, NOW)).toBe('fresh');
  });

  it('returns fresh for unparseable expiresAt strings', () => {
    expect(getExpiryStatus({ expiresAt: 'not a date' }, NOW)).toBe('fresh');
    expect(getExpiryStatus({ expiresAt: '' }, NOW)).toBe('fresh');
  });

  it('returns expired when expiresAt is in the past', () => {
    expect(getExpiryStatus({ expiresAt: daysFromNow(-1) }, NOW)).toBe('expired');
    expect(getExpiryStatus({ expiresAt: daysFromNow(-30) }, NOW)).toBe('expired');
  });

  it('returns warning at or within the default 3-day threshold', () => {
    expect(getExpiryStatus({ expiresAt: daysFromNow(0) }, NOW)).toBe('warning');
    expect(getExpiryStatus({ expiresAt: daysFromNow(1) }, NOW)).toBe('warning');
    expect(getExpiryStatus({ expiresAt: daysFromNow(2.5) }, NOW)).toBe('warning');
    expect(getExpiryStatus({ expiresAt: daysFromNow(3) }, NOW)).toBe('warning');
  });

  it('returns fresh outside the default threshold', () => {
    expect(getExpiryStatus({ expiresAt: daysFromNow(3.5) }, NOW)).toBe('fresh');
    expect(getExpiryStatus({ expiresAt: daysFromNow(7) }, NOW)).toBe('fresh');
    expect(getExpiryStatus({ expiresAt: daysFromNow(365) }, NOW)).toBe('fresh');
  });

  it('honors a custom warningDays threshold', () => {
    expect(getExpiryStatus({ expiresAt: daysFromNow(5) }, NOW, 7)).toBe('warning');
    expect(getExpiryStatus({ expiresAt: daysFromNow(8) }, NOW, 7)).toBe('fresh');
  });

  it('exports the documented default threshold', () => {
    expect(DEFAULT_EXPIRY_WARNING_DAYS).toBe(3);
  });
});

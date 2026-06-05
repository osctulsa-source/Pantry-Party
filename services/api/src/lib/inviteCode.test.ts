// ⚠ TEMPORARY upload-proxy. Replace with real backend per ADR-008.

import { describe, expect, it } from 'vitest';
import {
  INVITE_CHAR_POOL,
  INVITE_CODE_REGEX,
  INVITE_WORDS,
  generateInviteCode,
  isValidInviteCode,
} from './inviteCode.js';

describe('generateInviteCode', () => {
  it('produces a code matching the WORD-XXXX shape', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateInviteCode()).toMatch(INVITE_CODE_REGEX);
    }
  });

  it('always picks the word prefix from the configured INVITE_WORDS list', () => {
    const allowed = new Set<string>(INVITE_WORDS);
    for (let i = 0; i < 100; i++) {
      const word = generateInviteCode().split('-')[0] ?? '';
      expect(allowed.has(word)).toBe(true);
    }
  });

  it('only uses characters from the no-ambiguous-chars pool for the suffix', () => {
    const pool = new Set(INVITE_CHAR_POOL);
    for (let i = 0; i < 100; i++) {
      const suffix = generateInviteCode().split('-')[1] ?? '';
      expect(suffix).toHaveLength(4);
      for (const ch of suffix) {
        expect(pool.has(ch)).toBe(true);
      }
    }
    // Sanity: 0, 1, and O are excluded by construction. Belt-and-braces here
    // so a future tweak to INVITE_CHAR_POOL that re-introduces them fails loud.
    for (const banned of ['0', '1', 'O']) {
      // Only enforce on the suffix; word prefixes may legitimately contain O.
      const offenders = Array.from({ length: 200 }, () => generateInviteCode()).filter((c) =>
        (c.split('-')[1] ?? '').includes(banned),
      );
      expect(offenders).toHaveLength(0);
    }
  });

  it('returns different codes on consecutive calls (low-collision smoke check)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(generateInviteCode());
    // 20 words × 33^4 suffixes = ~23.8M possibilities; 50 draws colliding is
    // astronomically unlikely. Allow a tiny margin in case of bad luck.
    expect(codes.size).toBeGreaterThanOrEqual(48);
  });
});

describe('isValidInviteCode', () => {
  it('accepts a well-formed code', () => {
    expect(isValidInviteCode('BREAD-7K2M')).toBe(true);
    expect(isValidInviteCode('OLIVE-X9PL')).toBe(true);
    expect(isValidInviteCode('A-AAAA')).toBe(true);
  });

  it('rejects malformed codes', () => {
    expect(isValidInviteCode('bread-7K2M')).toBe(false); // lowercase word
    expect(isValidInviteCode('BREAD-7k2m')).toBe(false); // lowercase suffix
    expect(isValidInviteCode('BREAD-7K2')).toBe(false); // suffix too short
    expect(isValidInviteCode('BREAD-7K2MX')).toBe(false); // suffix too long
    expect(isValidInviteCode('BREAD7K2M')).toBe(false); // missing dash
    expect(isValidInviteCode('BREAD-')).toBe(false); // empty suffix
    expect(isValidInviteCode('-7K2M')).toBe(false); // empty word
    expect(isValidInviteCode('')).toBe(false);
    expect(isValidInviteCode('BREAD-7K2!')).toBe(false); // disallowed char
  });
});

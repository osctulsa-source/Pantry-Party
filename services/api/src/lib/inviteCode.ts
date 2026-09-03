// Shared invite-code domain helper used by the legacy household router.

import { randomInt } from 'node:crypto';

// Food-themed words chosen so codes read naturally when spoken aloud
// ("BREAD seven kilo two mike"). Kept short (3-5 letters) to keep total code
// length under ~10 chars.
export const INVITE_WORDS = [
  'BREAD',
  'OLIVE',
  'RICE',
  'MILK',
  'EGG',
  'FLOUR',
  'SUGAR',
  'HONEY',
  'APPLE',
  'SALT',
  'BASIL',
  'MINT',
  'LIME',
  'OAT',
  'KALE',
  'YAM',
  'FIG',
  'CORN',
  'BEAN',
  'NUT',
] as const;

// Excludes 0, 1, I, and O so codes read unambiguously over the phone or in a
// dim kitchen. Codes whose entire purpose is being shared verbally can't
// afford the I-vs-1 or O-vs-0 confusion ("Was that BREAD-7I2M or BREAD-712M?").
// 32 chars × 4 positions ≈ 1.05M combinations per word, so per-word collisions
// are still vanishingly rare in practice.
export const INVITE_CHAR_POOL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Validates the WORD-XXXX shape only. Does NOT check word-list membership —
// the UNIQUE constraint on household_invites.invite_code is the source of
// truth for uniqueness; this regex is a fast cheap pre-check before hitting
// Postgres.
export const INVITE_CODE_REGEX = /^[A-Z]+-[A-Z0-9]{4}$/;

/**
 * Generates a fresh WORD-XXXX invite code. The caller is responsible for
 * UNIQUE-constraint retry logic (collisions are rare but possible).
 *
 * Uses node:crypto.randomInt for unbiased uniform sampling — Math.random
 * would skew the distribution slightly across the pool sizes here.
 */
export function generateInviteCode(): string {
  const word = INVITE_WORDS[randomInt(0, INVITE_WORDS.length)];
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += INVITE_CHAR_POOL[randomInt(0, INVITE_CHAR_POOL.length)];
  }
  return `${word}-${suffix}`;
}

/**
 * Format-only check: WORD-XXXX with an uppercase word and a 4-char
 * [A-Z0-9] suffix. The endpoint uses this to reject obviously-malformed
 * /household/accept payloads before touching the database.
 */
export function isValidInviteCode(code: string): boolean {
  return INVITE_CODE_REGEX.test(code);
}

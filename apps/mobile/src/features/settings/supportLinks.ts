/**
 * Support + legal links shown in Settings and on Sign Up.
 *
 * The site is the Railway `legal` service generated from web/legal/ — the same
 * URLs entered in App Store Connect (docs/APPSTORE-METADATA.md). Apple expects
 * the privacy policy to be reachable inside the app, not only on the listing.
 */
import { BRAND } from '../../theme/brand';

const SITE = 'https://legal-production-9e0c.up.railway.app';

export const SUPPORT_LINKS = {
  website: `${SITE}/`,
  privacy: `${SITE}/privacy/`,
  terms: `${SITE}/terms/`,
  feedbackEmail: 'jcsenka013@gmail.com',
} as const;

/**
 * mailto: for "Send feedback", prefilled with the build so a tester's report
 * says which binary it came from without them having to look it up. Only the
 * build + OS go in — no account email, household, or pantry contents.
 */
export function feedbackMailto(build: string, os: string): string {
  const subject = `${BRAND.productName} beta feedback`;
  const body = [
    'What happened, and what did you expect?',
    '',
    '',
    '—',
    `Build: ${build}`,
    `OS: ${os}`,
  ].join('\n');
  return `mailto:${SUPPORT_LINKS.feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

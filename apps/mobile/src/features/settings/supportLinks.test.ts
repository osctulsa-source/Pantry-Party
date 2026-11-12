import { BRAND } from '../../theme/brand';
import { feedbackMailto, SUPPORT_LINKS } from './supportLinks';

describe('feedbackMailto', () => {
  it('addresses the support inbox with an encoded subject', () => {
    const url = feedbackMailto('1.0 (51)', 'iOS 26.1');
    expect(url.startsWith(`mailto:${SUPPORT_LINKS.feedbackEmail}?subject=`)).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('subject')).toBe(`${BRAND.productName} beta feedback`);
  });

  it('prefills the build and OS so reports identify the binary', () => {
    const params = new URLSearchParams(feedbackMailto('0.0.1 (51)', 'iOS 26.1').split('?')[1]);
    const body = params.get('body') ?? '';
    expect(body).toContain('Build: 0.0.1 (51)');
    expect(body).toContain('OS: iOS 26.1');
  });

  it('encodes characters that would otherwise break the mailto', () => {
    const url = feedbackMailto('a&b=c', 'iOS ?');
    expect(url).not.toMatch(/body=[^&]*&b=c/);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('body')).toContain('Build: a&b=c');
  });
});

describe('SUPPORT_LINKS', () => {
  it('points legal links at https pages on the support site', () => {
    for (const url of [SUPPORT_LINKS.privacy, SUPPORT_LINKS.terms]) {
      expect(url.startsWith(SUPPORT_LINKS.website)).toBe(true);
      expect(url.startsWith('https://')).toBe(true);
    }
  });
});

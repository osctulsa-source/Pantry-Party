import { isRetailBarcode } from './retailBarcode';

describe('isRetailBarcode', () => {
  it('accepts 8–14 digit UPCs/EANs', () => {
    expect(isRetailBarcode('01234567')).toBe(true);
    expect(isRetailBarcode('012345678901')).toBe(true);
    expect(isRetailBarcode('01234567890123')).toBe(true);
  });

  it('rejects QR/TEXT placeholders and junk', () => {
    expect(isRetailBarcode('QR')).toBe(false);
    expect(isRetailBarcode('TEXT')).toBe(false);
    expect(isRetailBarcode('abc')).toBe(false);
    expect(isRetailBarcode('123')).toBe(false);
    expect(isRetailBarcode('')).toBe(false);
  });
});

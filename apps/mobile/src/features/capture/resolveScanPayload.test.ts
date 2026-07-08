import { describe, expect, it } from '@jest/globals';

import { resolveScanPayload } from './resolveScanPayload';

describe('resolveScanPayload', () => {
  it('routes retail barcodes to lookup', () => {
    expect(resolveScanPayload('012345678905', 'ean13')).toEqual({
      kind: 'retail_barcode',
      raw: '012345678905',
      lookupCode: '012345678905',
    });
  });

  it('routes QR URLs separately', () => {
    expect(resolveScanPayload('https://example.com/list', 'qr')).toEqual({
      kind: 'qr_url',
      raw: 'https://example.com/list',
      url: 'https://example.com/list',
    });
  });

  it('parses multi-line QR text as item list', () => {
    const payload = resolveScanPayload('Milk\nEggs\nBread', 'qr');
    expect(payload.kind).toBe('qr_item_list');
    expect(payload.itemNames).toEqual(['Milk', 'Eggs', 'Bread']);
  });
});

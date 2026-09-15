jest.mock('expo-mlkit-ocr', () => ({
  isSupported: jest.fn().mockReturnValue(true),
  recognizeText: jest.fn(),
}));
jest.mock('@breadbox/core', () => ({
  parseReceiptText: jest.fn(),
  parseGroceryPaste: jest.fn(),
  looksLikeGroceryOrderDump: jest.fn(),
}));

import { isSupported, recognizeText } from 'expo-mlkit-ocr';
import { looksLikeGroceryOrderDump, parseGroceryPaste, parseReceiptText } from '@breadbox/core';

import { runTextOcr, TextOcrEmptyError, TextOcrUnavailableError } from './runTextOcr';

const mockRecognize = recognizeText as jest.Mock;
const mockReceipt = parseReceiptText as jest.Mock;
const mockGrocery = parseGroceryPaste as jest.Mock;
const mockChrome = looksLikeGroceryOrderDump as jest.Mock;

describe('runTextOcr', () => {
  beforeEach(() => {
    (isSupported as jest.Mock).mockReturnValue(true);
    mockRecognize.mockReset();
    mockReceipt.mockReset();
    mockGrocery.mockReset();
    mockChrome.mockReset();
    mockChrome.mockReturnValue(false);
    mockGrocery.mockReturnValue({ items: [], lookedLikeOrder: false });
    mockReceipt.mockReturnValue({ items: [], detectedStore: null });
  });

  it('returns parsed items with the character count the OCR read', async () => {
    mockRecognize.mockResolvedValue({ text: 'Milk\nEggs' });
    mockReceipt.mockReturnValue({ items: ['Milk', 'Eggs'], detectedStore: null });
    const result = await runTextOcr('file://photo.jpg');
    expect(result.items).toEqual([
      { name: 'Milk', quantity: 1, unit: null },
      { name: 'Eggs', quantity: 1, unit: null },
    ]);
    expect(result.textChars).toBe('Milk\nEggs'.length);
    expect(result.text).toBe('Milk\nEggs');
    expect(result.lookedLikeOrder).toBe(false);
  });

  it('prefers the grocery-order parser when Instacart chrome is present', async () => {
    mockRecognize.mockResolvedValue({ text: 'Found (1)\nOrganic Bananas\n2.4 lb' });
    mockChrome.mockReturnValue(true);
    mockGrocery.mockReturnValue({
      items: [{ name: 'Organic Bananas', quantity: 2.4, unit: 'lb' }],
      lookedLikeOrder: true,
    });
    mockReceipt.mockReturnValue({ items: ['Organic Bananas'], detectedStore: null });
    const result = await runTextOcr('file://order.jpg');
    expect(result.items).toEqual([{ name: 'Organic Bananas', quantity: 2.4, unit: 'lb' }]);
    expect(result.lookedLikeOrder).toBe(true);
  });

  // The attribution contract: textChars > 0 on the empty error means OCR read
  // text but the receipt PARSER found no item lines (parser gap); 0 means the
  // camera/OCR saw nothing (capture-quality miss). Telemetry splits on this.
  it('carries textChars on the empty error when OCR read text but the parser found no items', async () => {
    mockRecognize.mockResolvedValue({ text: 'Thanks for shopping!' });
    const err = await runTextOcr('file://photo.jpg').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TextOcrEmptyError);
    expect((err as TextOcrEmptyError).textChars).toBe('Thanks for shopping!'.length);
  });

  it('reports zero textChars when OCR itself saw nothing', async () => {
    mockRecognize.mockResolvedValue({ text: '' });
    const err = await runTextOcr('file://photo.jpg').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TextOcrEmptyError);
    expect((err as TextOcrEmptyError).textChars).toBe(0);
  });

  it('throws unavailable when OCR is not supported on the device', async () => {
    (isSupported as jest.Mock).mockReturnValue(false);
    await expect(runTextOcr('file://photo.jpg')).rejects.toThrow(TextOcrUnavailableError);
  });
});

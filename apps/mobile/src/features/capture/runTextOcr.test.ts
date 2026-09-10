jest.mock('expo-mlkit-ocr', () => ({
  isSupported: jest.fn().mockReturnValue(true),
  recognizeText: jest.fn(),
}));
jest.mock('@breadbox/core', () => ({
  parseReceiptText: jest.fn(),
}));

import { isSupported, recognizeText } from 'expo-mlkit-ocr';
import { parseReceiptText } from '@breadbox/core';

import { runTextOcr, TextOcrEmptyError, TextOcrUnavailableError } from './runTextOcr';

const mockRecognize = recognizeText as jest.Mock;
const mockParse = parseReceiptText as jest.Mock;

describe('runTextOcr', () => {
  beforeEach(() => {
    (isSupported as jest.Mock).mockReturnValue(true);
    mockRecognize.mockReset();
    mockParse.mockReset();
  });

  it('returns parsed items with the character count the OCR read', async () => {
    mockRecognize.mockResolvedValue({ text: 'Milk\nEggs' });
    mockParse.mockReturnValue({ items: ['Milk', 'Eggs'], detectedStore: null });
    const result = await runTextOcr('file://photo.jpg');
    expect(result.items).toEqual(['Milk', 'Eggs']);
    expect(result.textChars).toBe('Milk\nEggs'.length);
  });

  // The attribution contract: textChars > 0 on the empty error means OCR read
  // text but the receipt PARSER found no item lines (parser gap); 0 means the
  // camera/OCR saw nothing (capture-quality miss). Telemetry splits on this.
  it('carries textChars on the empty error when OCR read text but the parser found no items', async () => {
    mockRecognize.mockResolvedValue({ text: 'Thanks for shopping!' });
    mockParse.mockReturnValue({ items: [], detectedStore: null });
    const err = await runTextOcr('file://photo.jpg').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TextOcrEmptyError);
    expect((err as TextOcrEmptyError).textChars).toBe('Thanks for shopping!'.length);
  });

  it('reports zero textChars when OCR itself saw nothing', async () => {
    mockRecognize.mockResolvedValue({ text: '' });
    mockParse.mockReturnValue({ items: [], detectedStore: null });
    const err = await runTextOcr('file://photo.jpg').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TextOcrEmptyError);
    expect((err as TextOcrEmptyError).textChars).toBe(0);
  });

  it('throws unavailable when OCR is not supported on the device', async () => {
    (isSupported as jest.Mock).mockReturnValue(false);
    await expect(runTextOcr('file://photo.jpg')).rejects.toThrow(TextOcrUnavailableError);
  });
});

/**
 * runTextOcr — capture-path helper for on-device receipt/label OCR.
 */
import { isSupported, recognizeText } from 'expo-mlkit-ocr';
import { parseReceiptText, type FavoriteStoreHint } from '@breadbox/core';

export class TextOcrUnavailableError extends Error {
  constructor() {
    super('Text recognition is not available on this device.');
    this.name = 'TextOcrUnavailableError';
  }
}

export class TextOcrEmptyError extends Error {
  /** Characters ML Kit read before parsing found zero items — 0 means OCR itself
   *  saw nothing; >0 means the reader worked and the receipt PARSER found no
   *  item lines. Carried so the caller can telemetry the difference (accuracy
   *  attribution) without sending any text content off-device. */
  readonly textChars: number;

  constructor(textChars = 0) {
    super('No readable text found — try better light or move closer.');
    this.name = 'TextOcrEmptyError';
    this.textChars = textChars;
  }
}

export interface TextOcrResult {
  items: string[];
  detectedStore: FavoriteStoreHint | null;
  /** Characters the on-device OCR read from the image (accuracy denominator). */
  textChars: number;
}

export interface TextOcrOptions {
  limit?: number;
  favoriteStores?: FavoriteStoreHint[];
}

/** Run ML Kit / Vision OCR on a camera-captured image URI. */
export async function runTextOcr(uri: string, options: TextOcrOptions = {}): Promise<TextOcrResult> {
  if (!isSupported()) throw new TextOcrUnavailableError();
  const result = await recognizeText(uri);
  const textChars = result.text.length;
  const parsed = parseReceiptText(result.text, {
    limit: options.limit,
    favoriteStores: options.favoriteStores,
  });
  if (parsed.items.length === 0) throw new TextOcrEmptyError(textChars);
  return { items: parsed.items, detectedStore: parsed.detectedStore, textChars };
}

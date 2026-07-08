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
  constructor() {
    super('No readable text found — try better light or move closer.');
    this.name = 'TextOcrEmptyError';
  }
}

export interface TextOcrResult {
  items: string[];
  detectedStore: FavoriteStoreHint | null;
}

export interface TextOcrOptions {
  limit?: number;
  favoriteStores?: FavoriteStoreHint[];
}

/** Run ML Kit / Vision OCR on a camera-captured image URI. */
export async function runTextOcr(uri: string, options: TextOcrOptions = {}): Promise<TextOcrResult> {
  if (!isSupported()) throw new TextOcrUnavailableError();
  const result = await recognizeText(uri);
  const parsed = parseReceiptText(result.text, {
    limit: options.limit,
    favoriteStores: options.favoriteStores,
  });
  if (parsed.items.length === 0) throw new TextOcrEmptyError();
  return { items: parsed.items, detectedStore: parsed.detectedStore };
}

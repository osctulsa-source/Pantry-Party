/**
 * runTextOcr — capture-path helper for on-device receipt/label OCR.
 */
import { isSupported, recognizeText } from 'expo-mlkit-ocr';
import {
  looksLikeGroceryOrderDump,
  parseGroceryPaste,
  parseReceiptText,
  type FavoriteStoreHint,
  type GroceryPasteItem,
} from '@breadbox/core';

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
    super('No readable text found — try better light or a clearer photo.');
    this.name = 'TextOcrEmptyError';
    this.textChars = textChars;
  }
}

export interface TextOcrResult {
  items: GroceryPasteItem[];
  detectedStore: FavoriteStoreHint | null;
  /** Characters the on-device OCR read from the image (accuracy denominator). */
  textChars: number;
  /** Raw OCR text — paste preview uses this so the grocery parser can re-run. */
  text: string;
  lookedLikeOrder: boolean;
}

export interface TextOcrOptions {
  limit?: number;
  favoriteStores?: FavoriteStoreHint[];
}

export async function readImageText(uri: string): Promise<{ text: string; textChars: number }> {
  if (!isSupported()) throw new TextOcrUnavailableError();
  const result = await recognizeText(uri);
  const text = result.text ?? '';
  const textChars = text.length;
  if (text.trim().length === 0) throw new TextOcrEmptyError(0);
  return { text, textChars };
}

function parseOcrText(text: string, options: TextOcrOptions): Omit<TextOcrResult, 'text' | 'textChars'> {
  const grocery = parseGroceryPaste(text, { limit: options.limit });
  const receipt = parseReceiptText(text, {
    limit: options.limit,
    favoriteStores: options.favoriteStores,
  });
  const chrome = looksLikeGroceryOrderDump(text);
  const groceryWins =
    grocery.items.length > 0 &&
    (chrome ||
      grocery.items.some((item) => item.unit != null) ||
      grocery.items.length > receipt.items.length);

  if (groceryWins) {
    return {
      items: grocery.items,
      detectedStore: receipt.detectedStore,
      lookedLikeOrder: true,
    };
  }

  return {
    items: receipt.items.map((name) => ({ name, quantity: 1, unit: null })),
    detectedStore: receipt.detectedStore,
    lookedLikeOrder: false,
  };
}

/** Run ML Kit / Vision OCR on a camera-captured or library image URI. */
export async function runTextOcr(uri: string, options: TextOcrOptions = {}): Promise<TextOcrResult> {
  const { text, textChars } = await readImageText(uri);
  const parsed = parseOcrText(text, options);
  if (parsed.items.length === 0) throw new TextOcrEmptyError(textChars);
  return { ...parsed, text, textChars };
}

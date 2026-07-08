/**
 * Classify a camera scan payload — retail barcode vs QR text vs item list.
 */
import { parseReceiptText } from '@breadbox/core';

export type ScanPayloadKind = 'retail_barcode' | 'qr_text' | 'qr_url' | 'qr_item_list';

export interface ResolvedScanPayload {
  kind: ScanPayloadKind;
  /** Raw scanned string. */
  raw: string;
  /** For retail_barcode — digits to pass to Open Food Facts. */
  lookupCode?: string;
  /** For qr_item_list — parsed pantry names. */
  itemNames?: string[];
  /** For qr_url — the URL string. */
  url?: string;
}

const RETAIL_BARCODE = /^\d{8,14}$/;

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^www\./i.test(value);
}

/** True when expo-camera reports a QR symbol (or the payload is clearly non-numeric). */
export function isQrSymbol(type: string | undefined): boolean {
  return type === 'qr';
}

/**
 * Route a scanned code to the right handler.
 * Retail barcodes are numeric; QR payloads may be URLs, lists, or plain text.
 */
export function resolveScanPayload(raw: string, symbolType?: string): ResolvedScanPayload {
  const trimmed = raw.trim();
  const isQr = isQrSymbol(symbolType);

  if (!isQr && RETAIL_BARCODE.test(trimmed)) {
    return { kind: 'retail_barcode', raw: trimmed, lookupCode: trimmed };
  }

  if (looksLikeUrl(trimmed)) {
    const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    return { kind: 'qr_url', raw: trimmed, url };
  }

  const { items: itemNames } = parseReceiptText(trimmed);
  if (itemNames.length >= 2) {
    return { kind: 'qr_item_list', raw: trimmed, itemNames };
  }

  if (RETAIL_BARCODE.test(trimmed)) {
    return { kind: 'retail_barcode', raw: trimmed, lookupCode: trimmed };
  }

  return { kind: 'qr_text', raw: trimmed, itemNames: itemNames.length === 1 ? itemNames : undefined };
}

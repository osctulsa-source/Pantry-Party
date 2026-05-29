/**
 * Phase 0 — Capture spike · Receipt OCR vendor abstraction
 *
 * We test the OCR vendor behind an interface so swapping Tabscanner ↔ Veryfi ↔ Google
 * Vision is a one-file change. The spike measures: of N labelled receipts, what % of
 * line items do we extract correctly and map to a clean product name?
 *
 * THROWAWAY CODE.
 */

export interface OcrLineItem {
  rawText: string;
  name: string | null; // normalized product name, or null if unparseable
  price?: number;
  quantity?: number;
}

export interface OcrResult {
  store?: string;
  purchasedAt?: string;
  items: OcrLineItem[];
}

export interface OcrVendor {
  readonly id: string;
  /** Send an image (path or buffer) to the vendor, get structured line items back. */
  parseReceipt(imagePath: string): Promise<OcrResult>;
}

/** Tabscanner adapter — grocery-tuned pipeline. Fill in the real HTTP calls with OCR_API_KEY. */
export class TabscannerVendor implements OcrVendor {
  readonly id = "tabscanner";
  constructor(private apiKey: string) {}

  async parseReceipt(_imagePath: string): Promise<OcrResult> {
    // TODO(phase-0): POST image → poll for result → map to OcrResult.
    // Tabscanner is async: upload returns a token, you poll /result/{token}.
    throw new Error("Wire Tabscanner before running the OCR half of the spike.");
  }
}

/**
 * Normalizer — the part WE own and the part that actually moves the hit rate.
 * Raw OCR text is noisy ("ORG BABY SPINACH 5OZ", "GV MILK 1GAL"). This maps it to
 * a clean product name. Start dumb (rules), measure, then decide if it needs an LLM pass.
 */
export function normalizeLine(rawText: string): string | null {
  const cleaned = rawText
    .toUpperCase()
    .replace(/\b\d+(\.\d+)?\s?(OZ|LB|GAL|CT|PK|G|KG|ML|L)\b/g, "") // strip sizes
    .replace(/\$?\d+\.\d{2}/g, "") // strip prices
    .replace(/\b(ORG|GV|GREAT VALUE|KS|365)\b/g, "") // strip common brand/store prefixes
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 3) return null;
  // Title-case for display.
  return cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Retail UPC/EAN (8–14 digits) — not QR/TEXT basket placeholders. */
export function isRetailBarcode(tag: string): boolean {
  return /^\d{8,14}$/.test(tag.trim());
}

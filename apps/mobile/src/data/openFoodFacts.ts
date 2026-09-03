/**
 * Open Food Facts barcode lookup — DIRECT from the client (v1).
 *
 * Keyless, free, and suitable for direct public lookup. If testing shows
 * hit-rate, privacy, or rate-limit pain, move it behind the NestJS API and add
 * a managed paid fallback there; partner keys must never enter the client.
 */

import { categoryFromOffTags } from '@breadbox/core';

export interface OffProduct {
  name: string | null;
  brand: string | null;
  /** OFF's free-text package size ("500 g", "12 ct") — display only in v1. */
  quantityText: string | null;
  imageUrl: string | null;
  /** App category resolved from OFF categories_tags; null when unmapped. */
  category: string | null;
}

const FIELDS = 'product_name,brands,quantity,image_front_small_url,categories_tags';

export async function lookupBarcode(barcode: string, timeoutMs = 6000): Promise<OffProduct | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
      {
        signal: controller.signal,
        headers: { 'User-Agent': 'PantryParty-dev/0.0.1 (capture spike)' },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        brands?: string;
        quantity?: string;
        image_front_small_url?: string;
        categories_tags?: string[];
      };
    };
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    // OFF brands is comma-separated; first entry is the primary.
    const brand = p.brands ? (p.brands.split(',')[0] ?? '').trim() || null : null;
    return {
      name: p.product_name?.trim() || null,
      brand,
      quantityText: p.quantity?.trim() || null,
      imageUrl: p.image_front_small_url ?? null,
      category: categoryFromOffTags(p.categories_tags ?? []),
    };
  } catch {
    return null; // timeout / offline / parse — caller falls back to manual
  } finally {
    clearTimeout(timer);
  }
}

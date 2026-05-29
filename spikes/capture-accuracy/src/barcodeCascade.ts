/**
 * Phase 0 — Capture spike · Barcode resolution cascade
 *
 * Open Food Facts (free) → UPCitemdb (cheap) → paid fallback (last resort).
 * First confident hit wins. Every miss is logged so we can grow our own database.
 *
 * THROWAWAY CODE. Its only job is to produce a hit-rate number that tells us whether
 * the ≥90% bar is reachable. Do not ship this module.
 */

export type BarcodeSource = "openfoodfacts" | "upcitemdb" | "paid" | "miss";

export interface ProductHit {
  barcode: string;
  name: string | null;
  brand?: string;
  category?: string;
  source: BarcodeSource;
  confidence: number; // 0..1 — naive heuristic for the spike
}

const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";
const UPCITEMDB_TRIAL = "https://api.upcitemdb.com/prod/trial/lookup";

/** Tier 1 — Open Food Facts. Free, community-maintained, strong on packaged grocery. */
async function tryOpenFoodFacts(barcode: string): Promise<ProductHit | null> {
  try {
    const res = await fetch(`${OFF_BASE}/${encodeURIComponent(barcode)}.json?fields=product_name,brands,categories`);
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data.status !== 1 || !data.product?.product_name) return null;
    const name: string = data.product.product_name.trim();
    return {
      barcode,
      name,
      brand: data.product.brands?.split(",")[0]?.trim(),
      category: data.product.categories?.split(",").pop()?.trim(),
      source: "openfoodfacts",
      // Confidence heuristic: a present, non-trivial name is a strong signal.
      confidence: name.length >= 3 ? 0.9 : 0.5,
    };
  } catch {
    return null;
  }
}

/** Tier 2 — UPCitemdb. Cheap, good US UPC coverage where OFF has gaps. */
async function tryUpcItemDb(barcode: string): Promise<ProductHit | null> {
  try {
    const res = await fetch(`${UPCITEMDB_TRIAL}?upc=${encodeURIComponent(barcode)}`);
    if (!res.ok) return null; // trial endpoint rate-limits with 429 — expected during the spike
    const data: any = await res.json();
    const item = data.items?.[0];
    if (!item?.title) return null;
    return {
      barcode,
      name: String(item.title).trim(),
      brand: item.brand?.trim(),
      category: item.category?.split(">").pop()?.trim(),
      source: "upcitemdb",
      confidence: 0.8,
    };
  } catch {
    return null;
  }
}

/** Tier 3 — paid fallback. Stub. Wire a vendor (Barcode Lookup / go-upc) when tiers 1–2
 *  leave a gap big enough to matter. Measure the gap first; don't pay to close 2%. */
async function tryPaidFallback(_barcode: string): Promise<ProductHit | null> {
  // TODO(phase-0): implement only if OFF + UPCitemdb land below ~88%.
  return null;
}

/** Run the cascade. Returns the first confident hit, or a `miss` record for logging. */
export async function resolveBarcode(barcode: string): Promise<ProductHit> {
  const CONFIDENCE_FLOOR = 0.6;

  for (const tier of [tryOpenFoodFacts, tryUpcItemDb, tryPaidFallback]) {
    const hit = await tier(barcode);
    if (hit && hit.name && hit.confidence >= CONFIDENCE_FLOOR) return hit;
  }
  return { barcode, name: null, source: "miss", confidence: 0 };
}

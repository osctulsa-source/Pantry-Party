/**
 * Centralized product brand. Single source of truth for the in-app product name.
 *
 * Current codename: 'Breadbox'.
 * Trademark candidates pending clearance: Larder (primary), Crumb (alternate).
 * When trademark clearance lands, swap productName here in one place.
 *
 * NOTE: this is for in-app display ONLY. The app.json bundle identifier,
 * app-store name, and notification title ("Pantry" — describes what, not who)
 * are deliberately separate.
 */

export const BRAND = {
  productName: 'Breadbox',
} as const;

export type Brand = typeof BRAND;

/**
 * Centralized product brand. Single source of truth for the in-app product name.
 *
 * Product name: 'Pantry Glance' (chosen 2026-10; replaced the 'Breadbox'
 * codename and the 'Pantry Party' working name). Package names (@breadbox/*),
 * bundle ids, and the `pantryparty` URL scheme keep their old names on purpose —
 * ids are permanent once shipped; only display text follows the brand.
 *
 * NOTE: this is for in-app display ONLY. The home-screen name (app.config.js
 * `name`), App Store name, and notification title ("Pantry" — describes what,
 * not who) are set separately.
 */

export const BRAND = {
  productName: 'Pantry Glance',
} as const;

export type Brand = typeof BRAND;

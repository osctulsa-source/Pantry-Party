/**
 * Deep links the widgets open on tap. Built app-side and passed to the widget
 * through props, because the widget bundle can't import app modules.
 *
 * The scheme must match app.config.js's "scheme" field (baked into the native
 * binary — same contract as household/inviteLink.ts). Paths resolve through
 * the linking config in App.tsx.
 */
export const APP_URL_SCHEME = 'pantryparty';

export const EXPIRING_WIDGET_URL = `${APP_URL_SCHEME}://expiring`;
export const SHOPPING_WIDGET_URL = `${APP_URL_SCHEME}://shopping`;
export const COOK_ACTIVITY_URL = `${APP_URL_SCHEME}://cook`;

/**
 * Invite deep-link + share-message helpers.
 *
 * URL shape: pantryparty://invite/BREAD-7K2M
 *
 * The scheme must match app.json's "scheme" field (custom URL schemes are
 * baked into the native binary — changing either side needs a dev-client
 * rebuild). Scheme follows app.json's existing naming (slug pantry-party);
 * it's infrastructure, not display copy — it gets swapped alongside the rest
 * of app.json at brand lock, while user-facing text below reads from BRAND.
 *
 * The share message carries the plain code AND the link on purpose: the link
 * is an accelerator for recipients who already have the app; the code text is
 * the fallback for recipients who install it after receiving the message
 * (custom schemes have no app-store fallback without universal links — V2).
 */
import { BRAND } from '../../theme/brand';

export const INVITE_URL_SCHEME = 'pantryparty';

export function buildInviteUrl(code: string): string {
  return `${INVITE_URL_SCHEME}://invite/${encodeURIComponent(code)}`;
}

export function buildInviteShareMessage(code: string): string {
  return (
    `Join my pantry on ${BRAND.productName} — your invite code is ${code}.\n` +
    `Have the app? Open: ${buildInviteUrl(code)}`
  );
}

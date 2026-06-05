/**
 * Household API client — wraps the backend POST /household/invite endpoint.
 *
 * Modeled on the spoonacular client shape: named export, no class, env var
 * validated up front. Auth is handled by the caller — pass the access token
 * from the current Supabase session (state.session.access_token) so the
 * service-side requireUser middleware can verify the JWT.
 *
 * Why a dedicated client instead of inlining fetch in the modal:
 *   - Centralizes the API base URL + error normalization.
 *   - Lets future endpoints (accept, leave, list) live next to this one.
 *   - Keeps the InviteCodeModal a UI concern.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error('Missing EXPO_PUBLIC_API_URL — add to apps/mobile/.env.local');
}

export interface InviteResponse {
  invite_code: string;
  expires_at: string;
}

export async function generateInvite(
  householdId: string,
  accessToken: string,
): Promise<InviteResponse> {
  const response = await fetch(`${API_URL}/household/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ household_id: householdId }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Invite generation failed (${response.status}): ${body}`);
  }
  return response.json();
}

export interface AcceptInviteResponse {
  household_id: string;
}

// Thrown when /household/accept returns a non-2xx. The `status` field lets
// JoinHouseholdScreen branch on 400/404/409/410 for user-facing copy without
// regex-matching the message body.
export interface AcceptInviteError extends Error {
  status: number;
}

export async function acceptInvite(
  inviteCode: string,
  accessToken: string,
): Promise<AcceptInviteResponse> {
  const response = await fetch(`${API_URL}/household/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ invite_code: inviteCode }),
  });
  if (!response.ok) {
    const body = await response.text();
    const err = new Error(
      `Accept invite failed (${response.status}): ${body}`,
    ) as AcceptInviteError;
    err.status = response.status;
    throw err;
  }
  return response.json();
}

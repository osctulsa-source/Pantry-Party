/**
 * Household API client — wraps backend household endpoints.
 *
 * Modeled on the spoonacular client shape: named export, no class, env var
 * validated up front. Auth is handled by the caller — pass the access token
 * from the current Supabase session (state.session.access_token) so the
 * service-side requireUser middleware can verify the JWT.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_URL) {
  throw new Error('Missing EXPO_PUBLIC_API_URL — add to apps/mobile/.env.local');
}

export interface InviteResponse {
  invite_code: string;
  expires_at: string;
}

export interface BootstrapResponse {
  household_id: string;
  membership_id: string;
  membership_created_at: string;
  created: boolean;
}

export class HouseholdApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HouseholdApiError';
    this.status = status;
  }
}

function describeHouseholdFailure(
  action: 'invite' | 'accept' | 'bootstrap',
  status: number,
  body = '',
): string {
  if (status === 401) return 'Please sign in again, then retry.';
  if (action === 'invite' && status === 403) {
    return "This device isn't linked to that household yet. If you have more than one pantry, open Household and switch to the one with your food, then try again.";
  }
  if (action === 'accept' && status === 409) {
    if (body.includes('already a member')) return "You're already a member of this household.";
    return 'That invite was already used. Ask for a new one.';
  }
  if (action === 'accept' && status === 404) return "We couldn't find that invite code.";
  if (action === 'accept' && status === 410) return 'That invite has expired. Ask for a new one.';
  if (action === 'bootstrap') return "We couldn't reach your household. Check the connection and try again.";
  return `Couldn't ${action === 'invite' ? 'create an invite' : action}. Try again in a moment.`;
}

async function readError(
  response: Response,
  action: 'invite' | 'accept' | 'bootstrap',
): Promise<HouseholdApiError> {
  const body = await response.text().catch(() => '');
  return new HouseholdApiError(response.status, describeHouseholdFailure(action, response.status, body));
}

export async function bootstrapHousehold(accessToken: string): Promise<BootstrapResponse> {
  const response = await fetch(`${API_URL}/household/bootstrap`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) throw await readError(response, 'bootstrap');
  const body = (await response.json()) as Partial<BootstrapResponse>;
  if (!body.household_id || !body.membership_id) {
    throw new HouseholdApiError(500, describeHouseholdFailure('bootstrap', 500));
  }
  return {
    household_id: body.household_id,
    membership_id: body.membership_id,
    membership_created_at: body.membership_created_at ?? new Date().toISOString(),
    created: Boolean(body.created),
  };
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
  if (!response.ok) throw await readError(response, 'invite');
  return response.json();
}

export interface AcceptInviteResponse {
  household_id: string;
}

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
    const err = (await readError(response, 'accept')) as AcceptInviteError;
    throw err;
  }
  return response.json();
}

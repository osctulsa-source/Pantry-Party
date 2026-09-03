// Express authentication middleware for legacy routers mounted by NestJS (ADR-009).

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { NextFunction, Request, Response } from 'express';

const JWKS_URI = process.env.API_JWKS_URI;
if (!JWKS_URI) {
  throw new Error(
    'Missing API_JWKS_URI. Set it in infra/local-dev/docker/.env to the same ' +
      'Supabase JWKS URL used by PowerSync (PS_SUPABASE_JWKS_URI).',
  );
}
const JWKS = createRemoteJWKSet(new URL(JWKS_URI));

const AUDIENCE = 'authenticated';

export interface AuthedRequest extends Request {
  userId: string;
}

/**
 * Validates the Authorization: Bearer <jwt> header against the Supabase JWKS,
 * verifies `aud: authenticated`, and stashes the JWT `sub` as `req.userId`.
 *
 * The upload route uses `req.userId` to enforce that any user-id-shaped column
 * in the payload (user_id, created_by, added_by) matches the signed-in user.
 * Without that check, a signed-in user A could spoof writes as user B.
 */
export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Missing Bearer token' });
    return;
  }
  const token = header.slice('Bearer '.length);

  try {
    const { payload } = await jwtVerify(token, JWKS, { audience: AUDIENCE });
    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      res.status(401).json({ ok: false, error: 'JWT missing sub claim' });
      return;
    }
    (req as AuthedRequest).userId = sub;
    next();
  } catch (err) {
    res.status(401).json({
      ok: false,
      error: err instanceof Error ? err.message : 'JWT verification failed',
    });
  }
}

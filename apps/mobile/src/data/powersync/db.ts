/**
 * PowerSync database singleton + connector + auth-driven lifecycle.
 *
 * Architecture:
 *   - PowerSyncDatabase manages a local SQLite (op-sqlite-backed) that mirrors
 *     a slice of the upstream Postgres, populated by sync rules.
 *   - The Connector tells PowerSync HOW to authenticate (fetchCredentials) and
 *     how to push local changes back to the server (uploadData). uploadData is
 *     still a no-op — local writes (auto-create-household in PR #7.5, Add Item
 *     in PR #8) stay queued in SQLite's CRUD log until PR #8 implements the
 *     upload pass.
 *
 * Authentication:
 *   - PowerSync validates client JWTs against the Supabase JWKS (configured in
 *     infra/local-dev/service.yaml client_auth.jwks_uri).
 *   - fetchCredentials() pulls the current Supabase access token from
 *     supabase.auth.getSession() and forwards it as the PowerSync bearer token.
 *   - The token's `sub` claim (Supabase user id) becomes auth.user_id() in
 *     the sync rules, scoping every replicated row to the user's households.
 *
 * Lifecycle (auth-driven):
 *   - setupPowerSync() runs at app boot — init() only, NO connect(). Safe for
 *     unauthenticated users; gets local SQLite ready to read.
 *   - connectPowerSync() runs when AuthContext sees a Supabase session. Idempotent.
 *   - disconnectAndClearPowerSync() runs on sign-out. Wipes local SQLite so the
 *     next user starts with their own household_data only — critical for
 *     multi-user testing on the same install.
 */
import {
  PowerSyncDatabase,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from '@powersync/react-native';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';
import { AppSchema } from './schema';
import { supabase } from '../supabase/client';

let _db: PowerSyncDatabase | null = null;
let _connected = false;

class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const endpoint = process.env.EXPO_PUBLIC_POWERSYNC_URL;
    if (!endpoint) {
      throw new Error(
        'Missing EXPO_PUBLIC_POWERSYNC_URL. Check apps/mobile/.env.local — copy from .env.example.',
      );
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) {
      // Defensive — AuthContext only calls connectPowerSync() when a session
      // exists, so reaching here means the session was revoked between sign-in
      // and the first credentials fetch. PowerSync's auto-retry will pick up
      // a new session if/when one appears.
      throw new Error(
        'No Supabase session — PowerSync requires an authenticated user. ' +
          'Sign in before connecting.',
      );
    }
    return { endpoint, token };
  }

  // Local SQLite queues writes (auto-create-household lands rows in PR #7.5;
  // Add Item UI lands more in PR #8). Draining the queue back to Postgres is
  // PR #8's responsibility — until then writes accumulate locally without
  // reaching the server.
  async uploadData(_database: AbstractPowerSyncDatabase): Promise<void> {
    // intentionally empty for now
  }
}

export async function setupPowerSync(): Promise<PowerSyncDatabase> {
  if (_db) return _db;

  _db = new PowerSyncDatabase({
    schema: AppSchema,
    database: new OPSqliteOpenFactory({ dbFilename: 'pantry.db' }),
  });

  await _db.init();

  return _db;
}

export async function connectPowerSync(): Promise<void> {
  const db = await setupPowerSync();
  if (_connected) return;
  await db.connect(new SupabaseConnector());
  _connected = true;
}

export async function disconnectAndClearPowerSync(): Promise<void> {
  if (!_db || !_connected) return;
  await _db.disconnectAndClear();
  _connected = false;
}

export function getPowerSync(): PowerSyncDatabase {
  if (!_db) {
    throw new Error('PowerSync not initialized. Call setupPowerSync() first (App.tsx).');
  }
  return _db;
}

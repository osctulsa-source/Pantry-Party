/**
 * PowerSync database singleton + connector + auth-driven lifecycle.
 *
 * Architecture:
 *   - PowerSyncDatabase manages a local SQLite (op-sqlite-backed) that mirrors
 *     a slice of the upstream Postgres, populated by sync rules.
 *   - The Connector tells PowerSync HOW to authenticate (fetchCredentials) and
 *     how to push local changes back to the server (uploadData). Local writes
 *     (auto-create-household in PR #7.5, Add Item in PR #8b) accumulate in
 *     SQLite's CRUD log; uploadData drains them by POSTing to the temporary
 *     services/api upload-proxy (ADR-008).
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

// Serialize connect/disconnect so a sign-out can never interleave with an
// in-flight connect. Previously `_connected` flipped to true only AFTER
// `db.connect()` resolved, so a sign-out during connect saw `_connected ===
// false`, no-op'd the clear, and the connect then completed — leaving the next
// user on a shared device briefly seeing the previous user's local SQLite. Every
// connect/disconnect now chains onto the previous op, so disconnect always runs
// AFTER any pending connect and the clear can't be skipped.
let _opChain: Promise<void> = Promise.resolve();

function enqueueOp(op: () => Promise<void>): Promise<void> {
  // Run `op` regardless of whether the previous op resolved or rejected, so one
  // failure can't wedge the chain forever.
  _opChain = _opChain.then(op, op);
  return _opChain;
}

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

  // Drains the local CRUD queue to the upload-proxy. Throws on failure so
  // PowerSync retries (with backoff). On success we mark the batch complete
  // so PowerSync drops it from the local queue.
  //
  // The endpoint is the THROWAWAY Express service in services/api (ADR-008).
  // Wire format: `{ crud: CrudEntry[] }` POST → 200 `{ ok: true, applied: N }`.
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error(
        'Missing EXPO_PUBLIC_API_URL. Check apps/mobile/.env.local — copy from .env.example.',
      );
    }

    const batch = await database.getNextCrudTransaction();
    if (!batch) return;

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) {
      // Same defensive case as fetchCredentials — session was revoked between
      // queueing the write and uploading it. Throw so PowerSync retries when
      // a new session lands.
      throw new Error('No Supabase session — cannot upload CRUD queue');
    }

    const res = await fetch(`${apiUrl}/sync/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ crud: batch.crud.map((e) => e.toJSON()) }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Upload failed: HTTP ${res.status} ${body}`);
    }

    await batch.complete();
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

export function connectPowerSync(): Promise<void> {
  return enqueueOp(async () => {
    const db = await setupPowerSync();
    if (_connected) return;
    await db.connect(new SupabaseConnector());
    _connected = true;
  });
}

export function disconnectAndClearPowerSync(): Promise<void> {
  return enqueueOp(async () => {
    // No `_connected` guard: on sign-out we ALWAYS want local SQLite wiped, even
    // if a connect never finished. Because we run after any queued connect,
    // there is no in-flight connect left to un-clear the database.
    if (!_db) return;
    await _db.disconnectAndClear();
    _connected = false;
  });
}

export function getPowerSync(): PowerSyncDatabase {
  if (!_db) {
    throw new Error('PowerSync not initialized. Call setupPowerSync() first (App.tsx).');
  }
  return _db;
}

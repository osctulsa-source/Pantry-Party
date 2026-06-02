/**
 * PowerSync database singleton + connector.
 *
 * Architecture:
 *   - PowerSyncDatabase manages a local SQLite (op-sqlite-backed) that mirrors
 *     a slice of the upstream Postgres, populated by sync rules.
 *   - The Connector tells PowerSync HOW to authenticate (fetchCredentials) and
 *     how to push local changes back to the server (uploadData). For the
 *     walking skeleton, uploadData is a no-op — we're read-only.
 *
 * Lifecycle:
 *   - Call setupPowerSync() once at app boot. It instantiates the DB and
 *     connects it to the local-dev PowerSync instance.
 *   - The exported `db` is null until setupPowerSync() resolves; consumers
 *     should call getPowerSync() which throws if not initialized (catches
 *     ordering bugs).
 */
import {
  PowerSyncDatabase,
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from '@powersync/react-native';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';
import { AppSchema } from './schema';

let _db: PowerSyncDatabase | null = null;

class LocalDevConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const endpoint = process.env.EXPO_PUBLIC_POWERSYNC_URL;
    const token = process.env.EXPO_PUBLIC_POWERSYNC_TOKEN;
    if (!endpoint || !token) {
      throw new Error(
        'Missing EXPO_PUBLIC_POWERSYNC_URL or EXPO_PUBLIC_POWERSYNC_TOKEN. ' +
          'Check apps/mobile/.env.local — copy from .env.example and fill in.',
      );
    }
    return { endpoint, token };
  }

  // Walking-skeleton scope: read-only. The local SQLite queue still accumulates
  // any writes, but we don't drain it back to the server yet. Implement when
  // client writes are first needed (e.g., the Capture Engine).
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
  await _db.connect(new LocalDevConnector());

  return _db;
}

export function getPowerSync(): PowerSyncDatabase {
  if (!_db) {
    throw new Error('PowerSync not initialized. Call setupPowerSync() first (App.tsx).');
  }
  return _db;
}

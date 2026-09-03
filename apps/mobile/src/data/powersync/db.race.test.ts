/**
 * Regression test for the sign-out data-leak race (audit Task 4).
 *
 * On a shared device, signing out before connect() resolves used to leave
 * `_connected = false`, so disconnectAndClear no-op'd while the connect was
 * still in flight — the next user could briefly see the previous user's local
 * SQLite. connect/disconnect are now serialized through one promise chain, so a
 * sign-out issued mid-connect still runs the clear (after the connect settles).
 */

// A controllable fake for the native PowerSync database. Named `mock*` so the
// hoisted jest.mock factory may reference it.
const mockPs = {
  connectResolve: (): void => {},
  connectCalls: 0,
  disconnectAndClearCalls: 0,
  reset(): void {
    this.connectCalls = 0;
    this.disconnectAndClearCalls = 0;
  },
};

jest.mock('@powersync/react-native', () => ({
  PowerSyncDatabase: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn(
      () =>
        new Promise<void>((resolve) => {
          mockPs.connectCalls += 1;
          mockPs.connectResolve = resolve;
        }),
    ),
    disconnectAndClear: jest.fn(() => {
      mockPs.disconnectAndClearCalls += 1;
      return Promise.resolve();
    }),
    waitForFirstSync: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@powersync/op-sqlite', () => ({ OPSqliteOpenFactory: jest.fn() }));
jest.mock('./schema', () => ({ AppSchema: {} }));
jest.mock('../supabase/client', () => ({ supabase: { auth: {} } }));

// jest.mock is hoisted above this import, so db.ts loads with the fakes in place.
import { connectPowerSync, disconnectAndClearPowerSync } from './db';

describe('PowerSync connect/disconnect serialization', () => {
  const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

  it('clears local data even when sign-out races an in-flight connect', async () => {
    // Kick off connect — the fake leaves it pending until we resolve it.
    const connectP = connectPowerSync();
    // Let the queued connect op reach db.connect() (so it's genuinely mid-flight).
    while (mockPs.connectCalls === 0) await flush();

    // Sign out while the connect is still in flight.
    const disconnectP = disconnectAndClearPowerSync();

    // Let the connect settle; the queued disconnect then runs the clear.
    mockPs.connectResolve();
    await connectP;
    await disconnectP;

    // The clear must have run exactly once — the previous behavior skipped it.
    expect(mockPs.connectCalls).toBe(1);
    expect(mockPs.disconnectAndClearCalls).toBe(1);
  });
});

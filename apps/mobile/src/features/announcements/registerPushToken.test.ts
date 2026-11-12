/**
 * registerPushToken must never show the system permission prompt, and must
 * settle into a no-op once a token has been stored for the signed-in user.
 */
const mock_getPermissionsAsync = jest.fn();
const mock_requestPermissionsAsync = jest.fn();
const mock_getExpoPushTokenAsync = jest.fn();
const mock_execute = jest.fn();
const mock_getAll = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...a: unknown[]) => mock_getPermissionsAsync(...a),
  requestPermissionsAsync: (...a: unknown[]) => mock_requestPermissionsAsync(...a),
  getExpoPushTokenAsync: (...a: unknown[]) => mock_getExpoPushTokenAsync(...a),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-row-id' }));
jest.mock('../../data/powersync/db', () => ({
  getPowerSync: () => ({ execute: mock_execute, getAll: mock_getAll }),
}));

function load(): (userId: string) => Promise<void> {
  let fn!: (userId: string) => Promise<void>;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fn = require('./registerPushToken').registerPushToken;
  });
  return fn;
}

beforeEach(() => {
  jest.clearAllMocks();
  mock_getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
  mock_getAll.mockResolvedValue([]);
  mock_execute.mockResolvedValue(undefined);
});

it('does nothing and does not prompt while permission is not granted', async () => {
  mock_getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
  await load()('user-1');
  expect(mock_requestPermissionsAsync).not.toHaveBeenCalled();
  expect(mock_getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(mock_execute).not.toHaveBeenCalled();
});

it('stores the token once permission is granted, then is a no-op', async () => {
  const registerPushToken = load();
  mock_getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
  await registerPushToken('user-1');
  mock_getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  await registerPushToken('user-1');
  await registerPushToken('user-1');
  expect(mock_requestPermissionsAsync).not.toHaveBeenCalled();
  expect(mock_execute).toHaveBeenCalledTimes(1);
  expect(mock_execute.mock.calls[0][0]).toContain('INSERT INTO push_tokens');
});

it('registers again for a different user on the same device', async () => {
  const registerPushToken = load();
  mock_getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  await registerPushToken('user-1');
  await registerPushToken('user-2');
  expect(mock_execute).toHaveBeenCalledTimes(2);
});

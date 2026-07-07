/**
 * Shared test setup (runs after the framework is installed).
 *
 * Pin the timezone so the calendar-day expiry math is deterministic on any
 * runner, and mock AsyncStorage with the official in-memory jest mock (used by
 * several hooks). Add further native-module mocks here as the suite grows —
 * e.g. `import 'react-native-gesture-handler/jestSetup';` or expo-haptics.
 */
process.env.TZ = 'UTC';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

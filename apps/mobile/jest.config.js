/**
 * Jest config for the Expo mobile app. Run with `npm test -w apps/mobile`.
 *
 * Uses the `jest-expo` preset, which wires the React Native / Expo Babel
 * transform and the standard native-module mocks. Tests run through Babel (types
 * are stripped, not checked) — the `tsc` CI job covers typechecking of app
 * source, and jest covers behavior. Keep them complementary.
 *
 * As tests grow to import more ESM node_modules (e.g. lucide-react-native,
 * @react-navigation, @powersync), you may need to extend `transformIgnorePatterns`
 * so those packages are transformed. The starter suite only touches React Native
 * core + local modules, so the preset default is enough for now.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};

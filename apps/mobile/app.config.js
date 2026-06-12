/**
 * Expo app config — APP_VARIANT pattern (Android/Play framework arc).
 *
 * One config, two variants:
 *   development (default) — ids end in .dev; matches the previous app.json
 *                           values EXACTLY, so existing dev clients stay valid
 *                           and no rebuild is forced by this conversion.
 *   production            — clean ids for store builds (eas.json sets
 *                           APP_VARIANT per profile). Dev and production
 *                           builds can coexist on one device.
 *
 * The production Android package (com.osctulsa.pantryparty) is a PLACEHOLDER
 * pending brand lock: a Play package id becomes PERMANENT at first upload
 * (it lives in the store URL forever), so per the framework decision nothing
 * is uploaded to Play until the brand (Larder/Crumb) clears. Display name
 * changes freely at any time; ids do not.
 */
const VARIANT = process.env.APP_VARIANT ?? 'development';
const IS_PROD = VARIANT === 'production';

const ID_SUFFIX = IS_PROD ? '' : '.dev';

module.exports = {
  expo: {
    name: 'Pantry Party',
    slug: 'pantry-party',
    version: '0.0.1',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    scheme: 'pantryparty',
    ios: {
      supportsTablet: false,
      bundleIdentifier: `com.osctulsa.pantryparty${ID_SUFFIX}`,
    },
    android: {
      package: `com.osctulsa.pantryparty${ID_SUFFIX}`,
      adaptiveIcon: {
        backgroundColor: '#F6F2E9',
      },
    },
    plugins: [
      'expo-font',
      'expo-dev-client',
      [
        'expo-notifications',
        {
          color: '#2E5D3A',
        },
      ],
      '@sentry/react-native',
    ],
    experiments: {
      typedRoutes: false,
    },
  },
};

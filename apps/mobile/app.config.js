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
 *
 * Widget (lock-screen): the @bacons/apple-targets plugin links targets/widget/
 * at prebuild. The App Group below is FIXED (no .dev suffix) so the app, the
 * widget extension entitlement, and the Swift literal all share one suite.
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
    icon: './assets/icon.png',
    // OTA updates (EAS Update): JS/asset changes ship to existing TestFlight
    // installs via `eas update --channel production` — no new build. The
    // `fingerprint` runtime policy hashes the NATIVE runtime, so an update is
    // only delivered to builds whose native side matches; adding/removing a
    // native module changes the fingerprint and automatically fences old
    // builds off (no manual version discipline — important because `version`
    // stays put while eas.json autoIncrement bumps build numbers).
    updates: {
      url: 'https://u.expo.dev/b307f8c4-9c6f-46eb-9288-39a9b9a7c844',
    },
    runtimeVersion: {
      policy: 'fingerprint',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: `com.osctulsa.pantryparty${ID_SUFFIX}`,
      appleTeamId: 'X7E3964XPW',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
      // Shared with the widget extension so the app can write the "expiring"
      // snapshot the widget reads. Fixed id across variants (see header).
      entitlements: {
        'com.apple.security.application-groups': ['group.com.osctulsa.pantryparty'],
      },
    },
    android: {
      package: `com.osctulsa.pantryparty${ID_SUFFIX}`,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#C76B43',
      },
    },
    plugins: [
      'expo-font',
      'expo-dev-client',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#F6F2E9',
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission:
            'Pantry Party uses the camera to scan product barcodes so items add themselves.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#2E5D3A',
        },
      ],
      '@sentry/react-native',
      '@bacons/apple-targets',
    ],
    experiments: {
      typedRoutes: false,
    },
    extra: {
      eas: {
        projectId: 'b307f8c4-9c6f-46eb-9288-39a9b9a7c844',
      },
    },
  },
};

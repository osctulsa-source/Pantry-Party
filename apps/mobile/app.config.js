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
 * Widgets: expo-widgets generates the widget extension at prebuild; the widget
 * layouts are React components in src/features/widget/ (no Swift). The App
 * Group below is FIXED (no .dev suffix) so the app and the widget extension
 * share one suite across dev/prod variants.
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
    // OTA updates (EAS Update): JS/asset changes ship to existing installs via
    // `eas update --channel production` — no new build.
    //
    // runtimeVersion is an EXPLICIT string (was `policy: 'fingerprint'`). The
    // fingerprint policy proved non-deterministic for this monorepo + committed
    // prebuilt ios/ setup: the hash differed run-to-run locally AND between the
    // local machine and the EAS worker (all in the `expoConfigPlugins` tooling
    // closure, which `.fingerprintignore` can't exclude under expo-updates),
    // hard-failing builds with "Runtime version calculated on local machine not
    // equal to runtime version calculated during build".
    //
    // ⚠️ MANUAL DISCIPLINE: bump this string whenever the NATIVE runtime changes
    // (add/remove/upgrade a native module, change expo plugins / build props).
    // Publishing an OTA to a runtime whose installed build lacks the required
    // native code will crash those installs. JS-only changes need no bump.
    updates: {
      url: 'https://u.expo.dev/b307f8c4-9c6f-46eb-9288-39a9b9a7c844',
    },
    runtimeVersion: '1.0.0',
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
            'Pantry Party uses the camera to scan barcodes, QR codes, and read text from receipts.',
          barcodeScannerEnabled: true,
        },
      ],
      [
        'expo-mlkit-ocr',
        {
          iosEngine: 'auto',
        },
      ],
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '16.4',
          },
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
      'expo-localization',
      'posthog-react-native/expo',
      [
        'expo-widgets',
        {
          groupIdentifier: 'group.com.osctulsa.pantryparty',
          widgets: [
            {
              name: 'ExpiringSoonWidget',
              displayName: 'Expiring Soon',
              description: "See what's about to expire in your pantry.",
              ios: {
                supportedFamilies: [
                  'accessoryInline',
                  'accessoryCircular',
                  'accessoryRectangular',
                  'systemSmall',
                  'systemMedium',
                ],
              },
            },
            {
              name: 'ShoppingListWidget',
              displayName: 'Shopping List',
              description: 'Your shopping list, at a glance.',
              ios: {
                supportedFamilies: ['systemSmall', 'systemMedium', 'systemLarge'],
              },
            },
          ],
        },
      ],
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

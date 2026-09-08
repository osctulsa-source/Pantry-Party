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
      // OFF until expo-updates ships a RelaunchProcedure that does not
      // force-unwrap a nil error (expo/expo#45154, PR #45174).
      //
      // Builds 36/41/45 die in ~1s at RelaunchProcedure.swift:94
      // (EXC_BREAKPOINT / brk 1). A JS fatal inside 10s of launch marks the
      // embedded bundle failed; recovery then relaunches a previous update
      // that does not exist on a first install, `error` is nil, and Swift
      // aborts. That abort is what TestFlight shows — the original JS error
      // never appears. RootErrorBoundary cannot catch it.
      //
      // Re-enable after upgrading expo-updates past that unwrap, then cut a
      // new binary (runtimeVersion bump if the native module changes).
      enabled: false,
    },
    runtimeVersion: '1.0.0',
    ios: {
      supportsTablet: false,
      bundleIdentifier: `com.osctulsa.pantryparty${ID_SUFFIX}`,
      appleTeamId: 'X7E3964XPW',
      // SINGLE SOURCE OF TRUTH for the iOS build number.
      //
      // EAS `autoIncrement` is impossible here: with `appVersionSource: local`
      // it has to write the version back into the config, and it cannot write a
      // JS config (`autoIncrement option is not supported when using
      // app.config.js`). Flipping it on/off is how this repo ping-ponged
      // between "build fails" (#237) and "duplicate build number" (#238).
      //
      // Instead: bump this string, and let the preflight gate enforce that it
      // is strictly greater than every build number EAS has already issued.
      //   node scripts/preflight-ios-build.mjs --set-next   (bumps it for you)
      //   node scripts/preflight-ios-build.mjs              (verifies it)
      // EAS has already issued 45, so the next production binary is 46.
      buildNumber: '46',
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
      // MUST be listed BEFORE expo-widgets — yes, before.
      //
      // @expo/config-plugins composes same-key mods so that the LAST registered
      // mod runs FIRST (withMod calls your action, then `nextMod`, which is the
      // PREVIOUSLY registered mod). Both this plugin and expo-widgets use
      // withXcodeProject, so listing this one after expo-widgets makes it run
      // before the widget target exists. Verified by prebuild: it threw
      // "found no ExpoWidgetsTarget build configurations to sync".
      //
      // Why it is needed at all: expo-widgets hardcodes the widget target's
      // CURRENT_PROJECT_VERSION=1 / MARKETING_VERSION=1.0 (no config option) and
      // sets GENERATE_INFOPLIST_FILE=YES, so those beat the Info.plist it writes
      // and the extension ships CFBundleVersion 1 against an app at 41/42 — a
      // fatal IPA mismatch. This plugin rewrites them to match ios.buildNumber
      // and version, and throws rather than degrading silently.
      './plugins/withWidgetVersionSync',
      [
        'expo-widgets',
        {
          bundleIdentifier: `com.osctulsa.pantryparty${ID_SUFFIX}.ExpoWidgetsTarget`,
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

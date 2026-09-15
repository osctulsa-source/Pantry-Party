/**
 * release-invariants.cjs — the offline, pure checks on the iOS release config.
 *
 * Shared deliberately by two callers so they can never drift:
 *   - scripts/preflight-ios-build.mjs  (run before every production build)
 *   - apps/mobile/releaseInvariants.test.js  (run by CI on every PR)
 *
 * CI catching these matters more than the preflight catching them: by the time
 * you are running preflight you already intend to ship, whereas a PR that breaks
 * one of these invariants — reordering a plugin, re-enabling autoIncrement,
 * un-ignoring ios/ — should fail review, not the release.
 *
 * CommonJS on purpose: the .mjs script imports it fine, and jest-expo consumes
 * it without ESM transform configuration.
 *
 * Every rule here is a postmortem. See docs/TESTFLIGHT.md.
 */

const APP_BUNDLE_ID = 'com.osctulsa.pantryparty';
const WIDGET_TARGET_SUFFIX = '.ExpoWidgetsTarget';

const pluginName = (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin);

/**
 * @param {object} input
 * @param {object} input.config      app.config.js resolved with APP_VARIANT=production
 * @param {object} input.easJson     parsed apps/mobile/eas.json
 * @param {string} input.easignore   contents of the root .easignore
 * @returns {{ failures: {title: string, detail: string}[], passed: string[] }}
 */
function checkReleaseInvariants({ config, easJson, easignore }) {
  const failures = [];
  const passed = [];
  const fail = (title, detail) => failures.push({ title, detail });
  const ok = (msg) => passed.push(msg);

  // --- bundle identity ------------------------------------------------------
  const bundleId = config?.ios?.bundleIdentifier;
  if (bundleId !== APP_BUNDLE_ID) {
    fail(
      'Production bundle identifier is wrong',
      `Resolved "${bundleId}" with APP_VARIANT=production; expected "${APP_BUNDLE_ID}".\n` +
        'A `.dev` suffix means the production variant did not apply — the resulting\n' +
        'binary cannot be uploaded to the App Store Connect record.',
    );
  } else {
    ok(`production bundle id resolves to ${bundleId}`);
  }

  // --- OTA reachability -----------------------------------------------------
  const runtime = config?.runtimeVersion;
  if (typeof runtime !== 'string') {
    fail(
      'runtimeVersion is not an explicit string',
      'A fingerprint policy gives every build its own runtime — builds 42 and 43 got\n' +
        'de3e88e3... and f16fc241... while published updates target "1.0.0", so no OTA\n' +
        'can ever reach them. Keep runtimeVersion an explicit string and bump it by\n' +
        'hand when the native runtime changes (new/upgraded native module, plugin or\n' +
        'build-property change).',
    );
  } else {
    ok(`runtimeVersion is the explicit string "${runtime}"`);
  }

  // --- widget extension versioning -----------------------------------------
  const plugins = config?.plugins ?? [];
  const widgetsIdx = plugins.findIndex((p) => pluginName(p) === 'expo-widgets');
  const syncIdx = plugins.findIndex((p) => String(pluginName(p)).includes('withWidgetVersionSync'));

  if (widgetsIdx === -1) {
    fail('expo-widgets is not registered', 'The widget extension will not be generated.');
  } else if (syncIdx === -1 || syncIdx > widgetsIdx) {
    fail(
      'withWidgetVersionSync is missing or ordered after expo-widgets',
      'expo-widgets hardcodes the widget target to CURRENT_PROJECT_VERSION=1 /\n' +
        'MARKETING_VERSION=1.0 and sets GENERATE_INFOPLIST_FILE=YES, so the extension\n' +
        'ships CFBundleVersion 1 against a host app at 41/42. Apple treats that\n' +
        'mismatch as fatal — it took out TestFlight builds 41 and 42.\n' +
        '\n' +
        'The sync plugin must be listed BEFORE expo-widgets — counterintuitive, but\n' +
        '@expo/config-plugins composes same-key mods so the LAST registered mod runs\n' +
        'FIRST (withMod calls your action, then `nextMod`, the PREVIOUSLY registered\n' +
        'mod). Both use withXcodeProject, so listing it after expo-widgets makes it\n' +
        'run before the widget target exists.',
    );
  } else {
    ok('withWidgetVersionSync is ordered to run after expo-widgets (listed before it)');
  }

  // --- embedded JS (TestFlight 46) -----------------------------------------
  const forceJsIdx = plugins.findIndex((p) =>
    String(pluginName(p)).includes('withForceJsBundleEmbed'),
  );
  if (forceJsIdx === -1) {
    fail(
      'withForceJsBundleEmbed is not registered',
      'Xcode skips the "Bundle React Native code and images" phase when it has no\n' +
        'input/output files ("Based on dependency analysis"). TestFlight build 46\n' +
        'shipped with no main.jsbundle. With expo-updates disabled, AppDelegate looks\n' +
        'for that file and the app dies on launch: "No script URL provided".\n' +
        'Keep ./plugins/withForceJsBundleEmbed in app.config.js so the phase always runs.',
    );
  } else {
    ok('withForceJsBundleEmbed is registered so Release archives embed main.jsbundle');
  }

  const sentryIdx = plugins.findIndex((p) => String(pluginName(p)).includes('@sentry/react-native'));
  if (forceJsIdx !== -1 && sentryIdx !== -1 && forceJsIdx > sentryIdx) {
    fail(
      'withForceJsBundleEmbed is ordered after @sentry/react-native',
      'Sentry rewrites the RN bundle phase. @expo/config-plugins runs the last\n' +
        'registered withXcodeProject first, so listing this plugin after Sentry makes\n' +
        'Sentry run last and restore `/bin/sh sentry-xcode.sh /bin/sh …` — the wrap\n' +
        'that shipped TestFlight 46 with no JS. List withForceJsBundleEmbed BEFORE\n' +
        'Sentry (and PostHog) so it runs last and keeps the embed script.',
    );
  } else if (forceJsIdx !== -1 && sentryIdx !== -1) {
    ok('withForceJsBundleEmbed is listed before Sentry so it runs last');
  }

  const podMinIdx = plugins.findIndex((p) => String(pluginName(p)).includes('withPodMinIos'));
  if (podMinIdx === -1) {
    fail(
      'withPodMinIos is not registered',
      'Xcode 27 (iPhoneOS27.0.sdk) errors when any CocoaPods target is below iOS 15.\n' +
        'expo-build-properties only raises the app target. Keep ./plugins/withPodMinIos\n' +
        'so Sentry/RNSVG/AsyncStorage resource bundles do not fail the archive the way\n' +
        'the first build-49 attempt did after Xcode 26.6 → 27.0.',
    );
  } else {
    ok('withPodMinIos is registered so CocoaPods targets meet the Xcode 27 iOS 15 floor');
  }

  if (config?.updates?.enabled !== false) {
    fail(
      'expo-updates is enabled',
      'Builds 36/41/45 abort in ~1s at RelaunchProcedure.swift:94 (expo/expo#45154).\n' +
        'Keep updates.enabled false until expo-updates no longer force-unwraps a nil\n' +
        'error, then cut a new binary. A JS fatal inside 10s of first launch is what\n' +
        'triggers that path — RootErrorBoundary cannot catch it.',
    );
  } else {
    ok('expo-updates is disabled (RelaunchProcedure.swift:94 abort)');
  }

  const widgets = plugins.find((p) => pluginName(p) === 'expo-widgets');
  const widgetBundleId = Array.isArray(widgets) ? widgets[1]?.bundleIdentifier : undefined;
  if (widgetBundleId !== `${bundleId}${WIDGET_TARGET_SUFFIX}`) {
    fail(
      'Widget extension bundle identifier is not derived from the app bundle id',
      `Expected "${bundleId}${WIDGET_TARGET_SUFFIX}", got ${JSON.stringify(widgetBundleId)}.\n` +
        'An extension must live under its host app\'s bundle id, and it has to follow\n' +
        'the .dev suffix across variants or the two cannot be installed side by side.',
    );
  } else {
    ok('widget extension bundle id is derived from the app bundle id');
  }

  const buildNumber = config?.ios?.buildNumber;
  if (!/^\d+$/.test(String(buildNumber ?? ''))) {
    fail(
      'ios.buildNumber is missing or not an integer string',
      `Got ${JSON.stringify(buildNumber)}. It is the single source of truth for the\n` +
        'iOS build number and the widget-sync plugin reads it.',
    );
  } else {
    ok(`ios.buildNumber is the integer string "${buildNumber}"`);
  }

  // --- versioning scheme ----------------------------------------------------
  if (easJson?.cli?.appVersionSource !== 'local') {
    fail(
      'eas.json cli.appVersionSource is not "local"',
      'app.config.js is the single source of truth for ios.buildNumber. Switching to\n' +
        '"remote" splits it in two, and withWidgetVersionSync can no longer read the\n' +
        'number it must stamp onto the widget extension.',
    );
  } else {
    ok('eas.json appVersionSource is "local"');
  }

  if (easJson?.build?.production?.autoIncrement !== false) {
    fail(
      'Production profile has autoIncrement enabled',
      'EAS cannot write a JS config: `autoIncrement option is not supported when using\n' +
        'app.config.js`. Enabling it fails the build (#237); disabling it without a\n' +
        'monotonic check risks a duplicate build number (#238). This repo ping-ponged\n' +
        'between those two commits. scripts/preflight-ios-build.mjs is the replacement:\n' +
        'leave autoIncrement false and bump ios.buildNumber with --set-next.',
    );
  } else {
    ok('production autoIncrement is false');
  }

  // --- native project must never be uploaded --------------------------------
  const unignoresIos = String(easignore ?? '')
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line.startsWith('!') && line.includes('ios'));
  if (unignoresIos) {
    fail(
      '.easignore un-ignores apps/mobile/ios/',
      'ios/ is gitignored, so un-ignoring it uploads one machine\'s untracked local\n' +
        'snapshot. EAS skips prebuild whenever a native project is present, so that\n' +
        'snapshot silently overrides ios.buildNumber — it sat at CFBundleVersion 40\n' +
        'while app.config.js said 43. Let EAS prebuild from committed config instead.',
    );
  } else {
    ok('.easignore does not un-ignore apps/mobile/ios/');
  }

  return { failures, passed };
}

module.exports = { checkReleaseInvariants, APP_BUNDLE_ID, WIDGET_TARGET_SUFFIX };

/**
 * withWidgetVersionSync — keep the widget extension's version in lockstep with
 * the host app's.
 *
 * expo-widgets generates the widget target with CURRENT_PROJECT_VERSION = 1 and
 * MARKETING_VERSION = 1.0, and sets GENERATE_INFOPLIST_FILE = YES. The generated
 * keys beat the Info.plist expo-widgets writes, so the extension ships
 * CFBundleVersion 1 while the app is at 41/42. Apple requires an extension's
 * CFBundleVersion / CFBundleShortVersionString to match its host app; a mismatch
 * is a fatal IPA error and took out TestFlight builds 41 and 42.
 *
 * Must RUN after expo-widgets, which means it must be LISTED BEFORE it in the
 * app.config.js plugins array. @expo/config-plugins composes same-key mods so
 * the last registered mod runs first: withMod invokes your action and then
 * `nextMod`, which is the previously registered mod. Both this plugin and
 * expo-widgets use withXcodeProject, so listing this one after expo-widgets
 * makes it run before the widget target exists — which is what the
 * "found no ExpoWidgetsTarget build configurations" error below reports.
 *
 * Overwrites even when the widget target already exists, because expo-widgets
 * skips rewriting an existing build-configuration list.
 *
 * FAILS LOUDLY by design. Every silent-degradation path here has already cost a
 * TestFlight build, so a missing build number or an unmatched widget target
 * throws at prebuild rather than producing an IPA that dies on launch.
 */
const { withXcodeProject } = require('expo/config-plugins');

const TARGET_NAME = 'ExpoWidgetsTarget';

function quoted(value) {
  const raw = String(value);
  return raw.startsWith('"') ? raw : `"${raw}"`;
}

function isWidgetBuildConfig(settings) {
  if (!settings) return false;
  const plist = String(settings.INFOPLIST_FILE ?? '');
  const bundleId = String(settings.PRODUCT_BUNDLE_IDENTIFIER ?? '');
  return plist.includes(TARGET_NAME) || bundleId.includes(TARGET_NAME);
}

function applyWidgetVersions(project, version, buildNumber) {
  const configs = project.pbxXCBuildConfigurationSection();
  let updated = 0;
  for (const key of Object.keys(configs)) {
    const entry = configs[key];
    if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;
    if (!isWidgetBuildConfig(entry.buildSettings)) continue;
    entry.buildSettings.CURRENT_PROJECT_VERSION = quoted(buildNumber);
    entry.buildSettings.MARKETING_VERSION = quoted(version);
    updated += 1;
  }
  return updated;
}

/**
 * Resolve the build number the extension must carry. Under `appVersionSource:
 * local` this is always `ios.buildNumber` from app.config.js. The `1` guard
 * catches the exact regression this plugin exists to prevent: an unresolved
 * build number silently reproduces the 41/42 mismatch.
 */
function resolveBuildNumber(config) {
  const buildNumber = config.ios?.buildNumber;
  if (!buildNumber || String(buildNumber) === '1') {
    throw new Error(
      `[withWidgetVersionSync] ios.buildNumber is ${JSON.stringify(buildNumber)}. ` +
        'The widget extension would ship CFBundleVersion 1 against a different app ' +
        'version — the mismatch that killed TestFlight builds 41 and 42. Set ' +
        'ios.buildNumber in app.config.js (see scripts/preflight-ios-build.mjs).',
    );
  }
  return String(buildNumber);
}

function withWidgetVersionSync(config) {
  const version = config.version ?? config.ios?.version;
  const buildNumber = resolveBuildNumber(config);

  if (!version) {
    throw new Error('[withWidgetVersionSync] expo.version is required to sync the widget extension.');
  }

  return withXcodeProject(config, (cfg) => {
    const updated = applyWidgetVersions(cfg.modResults, version, buildNumber);
    if (updated === 0) {
      throw new Error(
        `[withWidgetVersionSync] found no ${TARGET_NAME} build configurations to sync. ` +
          'Either expo-widgets has not run yet (this plugin must be LISTED BEFORE ' +
          'expo-widgets in app.config.js so that it RUNS after it — see the note ' +
          'above) or the widget target name changed.',
      );
    }
    return cfg;
  });
}

module.exports = withWidgetVersionSync;
module.exports.quoted = quoted;
module.exports.isWidgetBuildConfig = isWidgetBuildConfig;
module.exports.applyWidgetVersions = applyWidgetVersions;
module.exports.resolveBuildNumber = resolveBuildNumber;

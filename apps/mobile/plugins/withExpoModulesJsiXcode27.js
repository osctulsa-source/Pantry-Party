/**
 * withExpoModulesJsiXcode27 — nested `xcodebuild -quiet` is a fatal archive
 * error on Xcode 27 even when the script exits 0.
 *
 * expo-modules-jsi's [CP-User] Build ExpoModulesJSI xcframework phase runs a
 * nested `xcodebuild -quiet`. Xcode 27's Swift driver then prints
 * `error: the following command failed with exit code 0 but produced no further
 * output` while still producing the xcframework. The parent archive treats that
 * `error:` line as fatal (`Command PhaseScriptExecution emitted errors but did
 * not return a nonzero exit code`) even though gym's xcresult status is
 * "succeeded" and main.jsbundle is in the .xcarchive.
 *
 * Dropping `-quiet` is the known workaround. Config-plugin only — patches the
 * vendored script at prebuild, no product Swift.
 */
const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod } = require('expo/config-plugins');

const QUIET_LINE = '    -quiet \\\n';
const SCRIPT_REL = path.join('apple', 'scripts', 'build-xcframework.sh');

function resolveJsiScript(projectRoot) {
  const pkgJson = require.resolve('expo-modules-jsi/package.json', { paths: [projectRoot] });
  return path.join(path.dirname(pkgJson), SCRIPT_REL);
}

function stripQuietFlag(src) {
  if (!src.includes(QUIET_LINE)) {
    return { contents: src, changed: false };
  }
  return { contents: src.replace(QUIET_LINE, ''), changed: true };
}

function withExpoModulesJsiXcode27(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const scriptPath = resolveJsiScript(cfg.modRequest.projectRoot);
      if (!fs.existsSync(scriptPath)) {
        throw new Error(
          `[withExpoModulesJsiXcode27] missing ${scriptPath}. ` +
            'Xcode 27 archives fail when the nested ExpoModulesJSI xcodebuild uses -quiet.',
        );
      }
      const original = fs.readFileSync(scriptPath, 'utf8');
      const { contents, changed } = stripQuietFlag(original);
      if (changed) {
        fs.writeFileSync(scriptPath, contents);
      }
      return cfg;
    },
  ]);
}

module.exports = withExpoModulesJsiXcode27;
module.exports.stripQuietFlag = stripQuietFlag;
module.exports.QUIET_LINE = QUIET_LINE;
module.exports.resolveJsiScript = resolveJsiScript;

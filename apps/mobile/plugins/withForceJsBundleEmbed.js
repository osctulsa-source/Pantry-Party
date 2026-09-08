/**
 * withForceJsBundleEmbed — make the "Bundle React Native code and images"
 * Xcode phase actually run on Release archives.
 *
 * Xcode's "Based on dependency analysis" skips a script with no input/output
 * files. EAS local Release then ships an IPA with no main.jsbundle. With
 * expo-updates disabled (RelaunchProcedure.swift:94 abort), AppDelegate looks
 * for that file and dies on launch: "No script URL provided". TestFlight
 * build 46 was that IPA. The simulator only launched after we copied a
 * bundle in by hand.
 *
 * Unchecking dependency analysis is `alwaysOutOfDate = 1` on the phase.
 * FAILS LOUDLY if the phase is missing — a silent no-op would ship another
 * empty-JS binary.
 */
const { withXcodeProject } = require('expo/config-plugins');

const PHASE_NAME = 'Bundle React Native code and images';
const JSBUNDLE_OUTPUT =
  '"$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/main.jsbundle"';

function isBundlePhase(phase) {
  if (!phase || typeof phase !== 'object') return false;
  return String(phase.name ?? '').includes(PHASE_NAME);
}

function forceBundlePhase(project) {
  const section = project.hash?.project?.objects?.PBXShellScriptBuildPhase;
  if (!section) return 0;
  let updated = 0;
  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) continue;
    const phase = section[key];
    if (!isBundlePhase(phase)) continue;
    phase.alwaysOutOfDate = 1;
    const outputs = phase.outputPaths;
    const list = Array.isArray(outputs) ? outputs : [];
    if (!list.some((p) => String(p).includes('main.jsbundle'))) {
      phase.outputPaths = [...list, JSBUNDLE_OUTPUT];
    }
    updated += 1;
  }
  return updated;
}

function withForceJsBundleEmbed(config) {
  return withXcodeProject(config, (cfg) => {
    const updated = forceBundlePhase(cfg.modResults);
    if (updated === 0) {
      throw new Error(
        `[withForceJsBundleEmbed] found no "${PHASE_NAME}" build phase. ` +
          'Release archives would ship without main.jsbundle and crash on launch ' +
          '(TestFlight 46).',
      );
    }
    return cfg;
  });
}

module.exports = withForceJsBundleEmbed;
module.exports.isBundlePhase = isBundlePhase;
module.exports.forceBundlePhase = forceBundlePhase;
module.exports.PHASE_NAME = PHASE_NAME;

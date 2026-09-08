/**
 * withForceJsBundleEmbed — make Release archives actually contain JS.
 *
 * TestFlight 46 launched into "No script URL provided". AppDelegate looks for
 * Bundle.main.url("main", "jsbundle") when expo-updates is off, and the IPA
 * had no such file. EAS *did* produce a bundle (`EAGER_BUNDLE` wrote
 * main.jsbundle to a temp dir) and gym even logged
 * `Executing … Bundle React Native code and images`, but the file never landed
 * in Payload/*.app.
 *
 * Two cooperating fixes, both fail-loud:
 *   1. Force the RN bundle phase to run and persist its output:
 *        - alwaysOutOfDate = 1  (uncheck "Based on dependency analysis")
 *        - declare main.jsbundle as an output so Xcode script sandboxing
 *          is allowed to write it (Xcode 15+ ENABLE_USER_SCRIPT_SANDBOXING)
 *        - set ENABLE_USER_SCRIPT_SANDBOXING=NO on the app project
 *   2. A follow-up script phase that copies the bundle into the archived
 *      .app if Xcode split CONFIGURATION_BUILD_DIR (UninstalledProducts)
 *      from TARGET_BUILD_DIR (InstallationBuildProductsLocation) — that
 *      split is how 46 archived successfully with JS sitting next to the
 *      product but not inside the IPA. If it still cannot find a bundle it
 *      runs `expo export:embed` itself, then `exit 1`s so an empty-JS
 *      binary cannot reach TestFlight.
 */
const { withXcodeProject } = require('expo/config-plugins');

const PHASE_NAME = 'Bundle React Native code and images';
const VERIFY_PHASE_NAME = 'Verify main.jsbundle is embedded';
const JSBUNDLE_OUTPUT =
  '"$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/main.jsbundle"';

const VERIFY_SCRIPT = [
  'set -e',
  'case "$CONFIGURATION" in',
  '  *Debug*) exit 0 ;;',
  'esac',
  'DEST_DIR="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"',
  'DEST="$DEST_DIR/main.jsbundle"',
  'mkdir -p "$DEST_DIR"',
  'C1="$CONFIGURATION_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/main.jsbundle"',
  'C2="$CONFIGURATION_BUILD_DIR/main.jsbundle"',
  'C3="$BUILT_PRODUCTS_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/main.jsbundle"',
  'if [ ! -f "$DEST" ]; then',
  '  if [ -f "$C1" ]; then cp "$C1" "$DEST"; fi',
  'fi',
  'if [ ! -f "$DEST" ]; then',
  '  if [ -f "$C2" ]; then cp "$C2" "$DEST"; fi',
  'fi',
  'if [ ! -f "$DEST" ]; then',
  '  if [ -f "$C3" ]; then cp "$C3" "$DEST"; fi',
  'fi',
  'if [ ! -f "$DEST" ]; then',
  '  echo "error: main.jsbundle is missing at $DEST." >&2',
  '  echo "error: TestFlight 46 shipped without JS and crashed on launch (No script URL provided)." >&2',
  '  echo "error: The Bundle React Native code and images phase must write this file." >&2',
  '  echo "error: C1=$C1 C2=$C2 C3=$C3" >&2',
  '  exit 1',
  'fi',
  'echo "embedded main.jsbundle at $DEST"',
].join('\n');

function isBundlePhase(phase) {
  if (!phase || typeof phase !== 'object') return false;
  return String(phase.name ?? '').includes(PHASE_NAME);
}

function isVerifyPhase(phase) {
  if (!phase || typeof phase !== 'object') return false;
  return String(phase.name ?? '').includes(VERIFY_PHASE_NAME);
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

function disableUserScriptSandboxing(project) {
  const configs = project.pbxXCBuildConfigurationSection?.() ?? {};
  let updated = 0;
  for (const key of Object.keys(configs)) {
    const entry = configs[key];
    if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;
    entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    updated += 1;
  }
  return updated;
}

function findAppTargetUuid(project) {
  const targets = project.pbxNativeTargetSection?.() ?? {};
  for (const key of Object.keys(targets)) {
    if (key.endsWith('_comment')) continue;
    const target = targets[key];
    const productType = String(target.productType ?? '');
    if (productType.includes('com.apple.product-type.application')) {
      return key;
    }
  }
  return project.getFirstTarget?.()?.uuid;
}

function ensureVerifyPhase(project) {
  const section = project.hash?.project?.objects?.PBXShellScriptBuildPhase ?? {};
  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) continue;
    if (isVerifyPhase(section[key])) return 'exists';
  }

  const targetUuid = findAppTargetUuid(project);
  if (!targetUuid) return 'missing-target';

  project.addBuildPhase([], 'PBXShellScriptBuildPhase', VERIFY_PHASE_NAME, targetUuid, {
    shellPath: '/bin/sh',
    shellScript: VERIFY_SCRIPT,
  });

  // addBuildPhase does not set alwaysOutOfDate; pin it the same way as the
  // RN bundle phase so Xcode cannot skip the check.
  const updated = project.hash.project.objects.PBXShellScriptBuildPhase;
  for (const key of Object.keys(updated)) {
    if (key.endsWith('_comment')) continue;
    if (!isVerifyPhase(updated[key])) continue;
    updated[key].alwaysOutOfDate = 1;
  }
  return 'added';
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
    disableUserScriptSandboxing(cfg.modResults);
    const verify = ensureVerifyPhase(cfg.modResults);
    if (verify === 'missing-target') {
      throw new Error(
        '[withForceJsBundleEmbed] found no app target to attach the main.jsbundle ' +
          'existence check. Refusing to produce another empty-JS binary.',
      );
    }
    return cfg;
  });
}

module.exports = withForceJsBundleEmbed;
module.exports.isBundlePhase = isBundlePhase;
module.exports.isVerifyPhase = isVerifyPhase;
module.exports.forceBundlePhase = forceBundlePhase;
module.exports.disableUserScriptSandboxing = disableUserScriptSandboxing;
module.exports.ensureVerifyPhase = ensureVerifyPhase;
module.exports.PHASE_NAME = PHASE_NAME;
module.exports.VERIFY_PHASE_NAME = VERIFY_PHASE_NAME;
module.exports.VERIFY_SCRIPT = VERIFY_SCRIPT;

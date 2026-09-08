/**
 * ios-embed-phase.cjs — assertions on the generated pbxproj RN bundle phase.
 *
 * Shared by scripts/check-ios-embed-phase.mjs (CI prebuild) and a unit test
 * that uses a fixture, so CI and the test cannot disagree on what "fixed"
 * looks like.
 */
const PHASE_NAME = 'Bundle React Native code and images';

function bundlePhaseChunk(pbxproj) {
  const marker = `name = "${PHASE_NAME}"`;
  const idx = String(pbxproj ?? '').indexOf(marker);
  if (idx === -1) return null;
  return pbxproj.slice(idx, idx + 3000);
}

function assertEmbedPhase(pbxproj) {
  const chunk = bundlePhaseChunk(pbxproj);
  if (!chunk) {
    throw new Error(
      `pbxproj has no "${PHASE_NAME}" phase. Release archives would ship without JS.`,
    );
  }
  if (chunk.includes('sentry-xcode.sh')) {
    throw new Error(
      'RN bundle phase still wraps sentry-xcode.sh. That composition is\n' +
        '`/bin/sh sentry-xcode.sh /bin/sh …`; with SENTRY_DISABLE_AUTO_UPLOAD=true\n' +
        'Sentry runs `/bin/sh` as the bundler and writes no JS (TestFlight 46).',
    );
  }
  if (!chunk.includes('embed-jsbundle.sh')) {
    throw new Error(
      `RN bundle phase does not invoke embed-jsbundle.sh.\n` +
        'withForceJsBundleEmbed must run after Sentry/PostHog (list it FIRST in plugins).\n' +
        'TestFlight 46 shipped with no main.jsbundle because this wrap was missing.',
    );
  }
}

module.exports = { PHASE_NAME, bundlePhaseChunk, assertEmbedPhase };

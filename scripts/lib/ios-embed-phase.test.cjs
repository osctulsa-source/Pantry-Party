const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { assertEmbedPhase } = require('./ios-embed-phase.cjs');

const GOOD = `
		00DD1BFF /* Bundle React Native code and images */ = {
			isa = PBXShellScriptBuildPhase;
			name = "Bundle React Native code and images";
			shellScript = "/bin/sh \\"$SRCROOT/scripts/embed-jsbundle.sh\\"\\n";
		};
`;

const SENTRY_WRAP = `
			name = "Bundle React Native code and images";
			shellScript = "/bin/sh \`sentry-xcode.sh\` /bin/sh \`posthog-xcode.sh\` react-native-xcode.sh\\n";
`;

describe('ios-embed-phase', () => {
  it('accepts the embed-jsbundle.sh phase body', () => {
    assert.doesNotThrow(() => assertEmbedPhase(GOOD));
  });

  it('rejects the Sentry/PostHog /bin/sh wrap from TestFlight 46', () => {
    assert.throws(() => assertEmbedPhase(SENTRY_WRAP), /sentry-xcode/);
  });

  it('rejects a project with no RN bundle phase', () => {
    assert.throws(() => assertEmbedPhase('// empty'), /no "Bundle React Native/);
  });
});

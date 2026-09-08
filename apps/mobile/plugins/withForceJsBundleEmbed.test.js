const { isBundlePhase, forceBundlePhase, PHASE_NAME } = require('./withForceJsBundleEmbed');

describe('withForceJsBundleEmbed', () => {
  it('matches the Expo template bundle phase by name', () => {
    expect(isBundlePhase({ name: `"${PHASE_NAME}"` })).toBe(true);
    expect(isBundlePhase({ name: PHASE_NAME })).toBe(true);
    expect(isBundlePhase({ name: '"Upload Debug Symbols to Sentry"' })).toBe(false);
    expect(isBundlePhase(undefined)).toBe(false);
  });

  it('marks the bundle phase always-out-of-date and records the jsbundle output', () => {
    const project = {
      hash: {
        project: {
          objects: {
            PBXShellScriptBuildPhase: {
              abc_comment: 'Bundle React Native code and images',
              abc: {
                name: `"${PHASE_NAME}"`,
                shellScript: 'echo bundle',
                outputPaths: [],
              },
              def: {
                name: '"Upload Debug Symbols to Sentry"',
                outputPaths: [],
              },
            },
          },
        },
      },
    };

    expect(forceBundlePhase(project)).toBe(1);
    const phase = project.hash.project.objects.PBXShellScriptBuildPhase.abc;
    expect(phase.alwaysOutOfDate).toBe(1);
    expect(phase.outputPaths.some((p) => String(p).includes('main.jsbundle'))).toBe(true);
    expect(project.hash.project.objects.PBXShellScriptBuildPhase.def.alwaysOutOfDate).toBeUndefined();
  });
});

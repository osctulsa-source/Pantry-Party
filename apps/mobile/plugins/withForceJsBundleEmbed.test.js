const {
  isBundlePhase,
  isVerifyPhase,
  forceBundlePhase,
  disableUserScriptSandboxing,
  ensureVerifyPhase,
  PHASE_NAME,
  VERIFY_PHASE_NAME,
} = require('./withForceJsBundleEmbed');

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

  it('turns off user-script sandboxing so the bundle script can write the .app', () => {
    const section = {
      debug: { buildSettings: { PRODUCT_NAME: 'PantryParty' } },
      skip_comment: 'Debug',
    };
    const project = {
      pbxXCBuildConfigurationSection() {
        return section;
      },
    };
    expect(disableUserScriptSandboxing(project)).toBe(1);
    expect(section.debug.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING).toBe('NO');
  });

  it('adds a Release existence-check phase once, on the app target', () => {
    const phases = {};
    const targets = {
      app: { productType: '"com.apple.product-type.application"', buildPhases: [] },
      widget: { productType: '"com.apple.product-type.app-extension"', buildPhases: [] },
    };
    const project = {
      hash: { project: { objects: { PBXShellScriptBuildPhase: phases, PBXNativeTarget: targets } } },
      pbxNativeTargetSection() {
        return targets;
      },
      addBuildPhase(_files, _type, name, targetUuid, options) {
        phases.verify = { name: `"${name}"`, ...options };
        targets[targetUuid].buildPhases.push({ value: 'verify', comment: name });
        return { uuid: 'verify', buildPhase: phases.verify };
      },
    };

    expect(ensureVerifyPhase(project)).toBe('added');
    expect(isVerifyPhase(phases.verify)).toBe(true);
    expect(phases.verify.alwaysOutOfDate).toBe(1);
    expect(phases.verify.shellScript).toMatch(/main\.jsbundle is missing/);
    expect(targets.app.buildPhases).toHaveLength(1);
    expect(targets.widget.buildPhases).toHaveLength(0);

    expect(ensureVerifyPhase(project)).toBe('exists');
    expect(targets.app.buildPhases).toHaveLength(1);
  });

  it('reports a missing app target instead of attaching the check to nothing', () => {
    const project = {
      hash: { project: { objects: { PBXShellScriptBuildPhase: {} } } },
      pbxNativeTargetSection() {
        return {};
      },
      getFirstTarget() {
        return undefined;
      },
    };
    expect(ensureVerifyPhase(project)).toBe('missing-target');
    expect(isVerifyPhase({ name: `"${VERIFY_PHASE_NAME}"` })).toBe(true);
  });
});

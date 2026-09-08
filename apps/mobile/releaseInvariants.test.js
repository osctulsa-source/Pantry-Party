/**
 * The iOS release config must stay shippable — enforced on every PR, not only
 * when someone is about to cut a build.
 *
 * Every assertion here is a TestFlight postmortem: a widget extension pinned to
 * version 1 (builds 41/42), a fingerprint runtimeVersion no OTA could reach
 * (builds 42/43), an autoIncrement flag that fails the build when on and risks a
 * duplicate build number when off (#237/#238), and a stale untracked ios/ that
 * silently overrode the configured build number.
 *
 * The rules live in scripts/lib/release-invariants.cjs, shared with
 * scripts/preflight-ios-build.mjs so the release gate and CI cannot disagree.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { checkReleaseInvariants } = require('../../scripts/lib/release-invariants.cjs');

const REPO_ROOT = join(__dirname, '..', '..');

/**
 * Load app.config.js under a given variant. The config reads process.env at
 * module scope, so each load needs a fresh module registry — jest.isolateModules,
 * not require.cache, because jest keeps its own registry.
 */
function loadConfig(variant) {
  const previous = process.env.APP_VARIANT;
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  try {
    let config;
    jest.isolateModules(() => {
      config = require('./app.config.js').expo;
    });
    return config;
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
  }
}

describe('iOS release invariants', () => {
  const config = loadConfig('production');
  const easJson = JSON.parse(readFileSync(join(__dirname, 'eas.json'), 'utf8'));
  const easignore = readFileSync(join(REPO_ROOT, '.easignore'), 'utf8');

  it('holds for the committed config', () => {
    const { failures } = checkReleaseInvariants({ config, easJson, easignore });
    // Report every broken invariant at once, with the postmortem attached.
    const report = failures.map((f) => `\n✖ ${f.title}\n${f.detail}`).join('\n');
    expect(report).toBe('');
  });

  it('resolves .dev identifiers for the development variant', () => {
    const dev = loadConfig(undefined);
    expect(dev.ios.bundleIdentifier).toBe('com.osctulsa.pantryparty.dev');
    expect(dev.android.package).toBe('com.osctulsa.pantryparty.dev');
    // The App Group is deliberately NOT suffixed — the app and its widget
    // extension share one suite across variants.
    expect(dev.ios.entitlements['com.apple.security.application-groups']).toEqual([
      'group.com.osctulsa.pantryparty',
    ]);
  });

  it('rejects a config that regresses any invariant', () => {
    // Guards the guard: a checker that silently passes everything is worse than
    // no checker, because it reads like coverage.
    const broken = {
      ...config,
      runtimeVersion: { policy: 'fingerprint' },
      updates: { ...(config.updates ?? {}), enabled: true },
      plugins: config.plugins.filter(
        (p) =>
          !String(Array.isArray(p) ? p[0] : p).includes('withWidgetVersionSync') &&
          !String(Array.isArray(p) ? p[0] : p).includes('withForceJsBundleEmbed'),
      ),
    };
    const { failures } = checkReleaseInvariants({
      config: broken,
      easJson: { cli: { appVersionSource: 'remote' }, build: { production: { autoIncrement: true } } },
      easignore: '!apps/mobile/ios/\n',
    });
    const titles = failures.map((f) => f.title);

    expect(titles).toEqual(
      expect.arrayContaining([
        expect.stringContaining('runtimeVersion'),
        expect.stringContaining('withWidgetVersionSync'),
        expect.stringContaining('withForceJsBundleEmbed'),
        expect.stringContaining('expo-updates is enabled'),
        expect.stringContaining('appVersionSource'),
        expect.stringContaining('autoIncrement'),
        expect.stringContaining('.easignore'),
      ]),
    );
  });

  it('rejects withWidgetVersionSync listed AFTER expo-widgets', () => {
    // The real regression, caught by a container prebuild rather than by this
    // suite: @expo/config-plugins runs the LAST registered mod FIRST, so a sync
    // plugin listed after expo-widgets runs before the widget target exists and
    // the extension keeps CFBundleVersion 1. Listing order is inverted from
    // execution order, which is exactly the kind of thing that gets "tidied"
    // back the wrong way later.
    const nameOf = (p) => (Array.isArray(p) ? p[0] : p);
    const withoutSync = config.plugins.filter(
      (p) => !String(nameOf(p)).includes('withWidgetVersionSync'),
    );
    const widgetsIdx = withoutSync.findIndex((p) => nameOf(p) === 'expo-widgets');
    const misordered = [
      ...withoutSync.slice(0, widgetsIdx + 1),
      './plugins/withWidgetVersionSync',
      ...withoutSync.slice(widgetsIdx + 1),
    ];

    const { failures } = checkReleaseInvariants({
      config: { ...config, plugins: misordered },
      easJson,
      easignore,
    });

    expect(failures.map((f) => f.title)).toEqual([
      'withWidgetVersionSync is missing or ordered after expo-widgets',
    ]);
  });

  it('rejects withForceJsBundleEmbed listed AFTER Sentry', () => {
    const nameOf = (p) => (Array.isArray(p) ? p[0] : p);
    const without = config.plugins.filter((p) => !String(nameOf(p)).includes('withForceJsBundleEmbed'));
    const sentryIdx = without.findIndex((p) => String(nameOf(p)).includes('@sentry/react-native'));
    const misordered = [
      ...without.slice(0, sentryIdx + 1),
      './plugins/withForceJsBundleEmbed',
      ...without.slice(sentryIdx + 1),
    ];

    const { failures } = checkReleaseInvariants({
      config: { ...config, plugins: misordered },
      easJson,
      easignore,
    });

    expect(failures.map((f) => f.title)).toEqual([
      'withForceJsBundleEmbed is ordered after @sentry/react-native',
    ]);
  });
});

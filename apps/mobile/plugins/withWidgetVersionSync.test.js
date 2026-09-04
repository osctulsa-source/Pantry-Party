const {
  quoted,
  isWidgetBuildConfig,
  applyWidgetVersions,
  resolveBuildNumber,
} = require('./withWidgetVersionSync');

describe('withWidgetVersionSync', () => {
  it('quotes version strings the way the xcode pbxproj writer expects', () => {
    expect(quoted('43')).toBe('"43"');
    expect(quoted('0.0.1')).toBe('"0.0.1"');
    expect(quoted('"43"')).toBe('"43"');
  });

  it('matches the ExpoWidgetsTarget build configs from the 42 Xcode log', () => {
    expect(
      isWidgetBuildConfig({
        INFOPLIST_FILE: 'ExpoWidgetsTarget/Info.plist',
        PRODUCT_BUNDLE_IDENTIFIER: '"com.osctulsa.pantryparty.ExpoWidgetsTarget"',
        CURRENT_PROJECT_VERSION: '"1"',
        MARKETING_VERSION: '"1.0"',
      }),
    ).toBe(true);
    expect(
      isWidgetBuildConfig({
        PRODUCT_BUNDLE_IDENTIFIER: '"com.osctulsa.pantryparty"',
        INFOPLIST_FILE: 'PantryParty/Info.plist',
      }),
    ).toBe(false);
  });

  it('overwrites hardcoded widget 1 / 1.0 without touching the app target', () => {
    const section = {
      widgetRelease: {
        buildSettings: {
          INFOPLIST_FILE: 'ExpoWidgetsTarget/Info.plist',
          PRODUCT_BUNDLE_IDENTIFIER: '"com.osctulsa.pantryparty.ExpoWidgetsTarget"',
          CURRENT_PROJECT_VERSION: '"1"',
          MARKETING_VERSION: '"1.0"',
        },
      },
      appRelease: {
        buildSettings: {
          PRODUCT_BUNDLE_IDENTIFIER: '"com.osctulsa.pantryparty"',
          CURRENT_PROJECT_VERSION: '"43"',
          MARKETING_VERSION: '"0.0.1"',
        },
      },
    };
    const project = {
      pbxXCBuildConfigurationSection() {
        return section;
      },
    };

    expect(applyWidgetVersions(project, '0.0.1', '43')).toBe(1);
    const widget = section.widgetRelease.buildSettings;
    const app = section.appRelease.buildSettings;
    expect(widget.CURRENT_PROJECT_VERSION).toBe('"43"');
    expect(widget.MARKETING_VERSION).toBe('"0.0.1"');
    expect(app.CURRENT_PROJECT_VERSION).toBe('"43"');
    expect(app.MARKETING_VERSION).toBe('"0.0.1"');
  });

  describe('resolveBuildNumber — the 41/42 regression guard', () => {
    it('returns the configured build number as a string', () => {
      expect(resolveBuildNumber({ ios: { buildNumber: '44' } })).toBe('44');
      expect(resolveBuildNumber({ ios: { buildNumber: 44 } })).toBe('44');
    });

    it('throws rather than shipping an extension at version 1', () => {
      expect(() => resolveBuildNumber({ ios: { buildNumber: '1' } })).toThrow(/builds 41 and 42/);
      expect(() => resolveBuildNumber({ ios: {} })).toThrow(/ios\.buildNumber/);
      expect(() => resolveBuildNumber({})).toThrow(/ios\.buildNumber/);
    });
  });
});

const { applyPodMinIos, MIN_IOS, TAG } = require('./withPodMinIos');

const SAMPLE_PODFILE = `
platform :ios, '16.4'

target 'PantryParty' do
  use_expo_modules!
end

post_install do |installer|
  react_native_post_install(installer)
end
`;

describe('withPodMinIos', () => {
  it('injects a post_install bump to the Xcode 27 SDK floor', () => {
    const out = applyPodMinIos(SAMPLE_PODFILE);
    expect(out).toContain(`# @generated begin ${TAG}`);
    expect(out).toContain(`IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS}'`);
    expect(out).toContain('if current.to_f < 15.0.to_f');
    expect(out.indexOf(`# @generated begin ${TAG}`)).toBeGreaterThan(
      out.indexOf('post_install do |installer|'),
    );
    expect(out.indexOf('react_native_post_install')).toBeGreaterThan(out.indexOf(`# @generated end ${TAG}`));
  });

  it('is idempotent — a second pass does not duplicate the hook', () => {
    const once = applyPodMinIos(SAMPLE_PODFILE);
    const twice = applyPodMinIos(once);
    expect(twice).toBe(once);
    expect(twice.split(`# @generated begin ${TAG}`).length).toBe(2);
  });

  it('throws rather than producing an archive Xcode 27 will reject', () => {
    expect(() => applyPodMinIos("platform :ios, '16.4'\n")).toThrow(/post_install/);
  });
});

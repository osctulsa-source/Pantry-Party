const { stripQuietFlag, QUIET_LINE } = require('./withExpoModulesJsiXcode27');

describe('withExpoModulesJsiXcode27', () => {
  it('drops the nested xcodebuild -quiet flag that Xcode 27 treats as fatal', () => {
    const src = ['  (cd "$PACKAGE_DIR" && env -i "${env_args[@]}" \\', '    xcodebuild \\', QUIET_LINE, '    BUILD_LIBRARY_FOR_DISTRIBUTION=YES \\', '  )'].join(
      '\n',
    );
    const { contents, changed } = stripQuietFlag(src);
    expect(changed).toBe(true);
    expect(contents).not.toContain('-quiet');
    expect(contents).toContain('BUILD_LIBRARY_FOR_DISTRIBUTION=YES');
  });

  it('is a no-op when a later expo-modules-jsi already omitted -quiet', () => {
    const src = 'xcodebuild build -scheme ExpoModulesJSI\n';
    expect(stripQuietFlag(src)).toEqual({ contents: src, changed: false });
  });
});

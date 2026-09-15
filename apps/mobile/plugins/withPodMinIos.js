/**
 * withPodMinIos — raise CocoaPods IPHONEOS_DEPLOYMENT_TARGET to the Xcode SDK floor.
 *
 * expo-build-properties already sets the *app* target to 16.4. Xcode 27's
 * iPhoneOS27.0 SDK still errors on *pod* targets below 15.0, including resource
 * bundles Expo does not rewrite: Sentry-Sentry (11.0), RNSVG-RNSVGFilters
 * (12.4), RNCAsyncStorage_resources (13.4), ReachabilitySwift (12.0).
 *
 * That failed the first Mac-local archive of build 49 after Xcode jumped
 * 26.6 → 27.0. This plugin injects a Podfile post_install hook that bumps any
 * pod setting below 15.0. Config-plugin only — no hand-written native product
 * code.
 */
const { withPodfile } = require('expo/config-plugins');

const MIN_IOS = '15.0';
const TAG = 'breadbox-pod-min-ios';

const POD_MIN_IOS_RUBY = [
  '    installer.pods_project.targets.each do |target|',
  '      target.build_configurations.each do |bc|',
  "        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
  '        next if current.nil? || current.to_s.empty?',
  `        if current.to_f < ${MIN_IOS}.to_f`,
  `          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS}'`,
  '        end',
  '      end',
  '    end',
].join('\n');

function generatedBlock() {
  return [
    `    # @generated begin ${TAG}`,
    POD_MIN_IOS_RUBY,
    `    # @generated end ${TAG}`,
  ].join('\n');
}

function stripGenerated(src) {
  const re = new RegExp(`\\n?[ \\t]*# @generated begin ${TAG}[\\s\\S]*?# @generated end ${TAG}\\n?`, 'g');
  return src.replace(re, '\n');
}

function applyPodMinIos(src) {
  const cleaned = stripGenerated(src);
  if (!/post_install do \|installer\|/.test(cleaned)) {
    throw new Error(
      '[withPodMinIos] Podfile has no `post_install do |installer|` block. ' +
        'Xcode 27 rejects CocoaPods targets below iOS 15 (Sentry, RNSVG, AsyncStorage) ' +
        'and this hook is what raises them.',
    );
  }
  return cleaned.replace(/post_install do \|installer\|/, `post_install do |installer|\n${generatedBlock()}`);
}

function withPodMinIos(config) {
  return withPodfile(config, (cfg) => {
    cfg.modResults.contents = applyPodMinIos(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withPodMinIos;
module.exports.applyPodMinIos = applyPodMinIos;
module.exports.stripGenerated = stripGenerated;
module.exports.MIN_IOS = MIN_IOS;
module.exports.TAG = TAG;
module.exports.POD_MIN_IOS_RUBY = POD_MIN_IOS_RUBY;

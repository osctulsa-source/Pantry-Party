#!/bin/sh
# embed-jsbundle.sh — Release archive JS embedder.
#
# The Expo + Sentry + PostHog plugins compose the Xcode phase as:
#   /bin/sh sentry-xcode.sh /bin/sh posthog-xcode.sh react-native-xcode.sh
# Sentry takes $1 as the RN script. That $1 is the extra `/bin/sh`. With
# SENTRY_DISABLE_AUTO_UPLOAD=true (eas.json production) it then runs
# `/bin/sh -c /bin/sh`, which exits 0 and never bundles. TestFlight 46
# shipped that empty-JS IPA.
#
# This script is the phase body. It is copied into ios/scripts at prebuild.
set -e

if [ -f "$PODS_ROOT/../.xcode.env" ]; then
  # shellcheck source=/dev/null
  . "$PODS_ROOT/../.xcode.env"
fi
if [ -f "$PODS_ROOT/../.xcode.env.local" ]; then
  # shellcheck source=/dev/null
  . "$PODS_ROOT/../.xcode.env.local"
fi

export PROJECT_ROOT="${PROJECT_ROOT:-$PROJECT_DIR/..}"
unset SKIP_BUNDLING
export BUNDLE_COMMAND="${BUNDLE_COMMAND:-export:embed}"
NODE_BINARY="${NODE_BINARY:-node}"

if [ -z "$ENTRY_FILE" ]; then
  ENTRY_FILE="$("$NODE_BINARY" -e "require('expo/scripts/resolveAppEntry')" "$PROJECT_ROOT" ios absolute | tail -n 1)"
  export ENTRY_FILE
fi

if [ -z "$CLI_PATH" ]; then
  CLI_PATH="$("$NODE_BINARY" --print "require.resolve('@expo/cli')")"
  export CLI_PATH
fi

RN_XCODE="$("$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'")"
/bin/sh "$RN_XCODE"

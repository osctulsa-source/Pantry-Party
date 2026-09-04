#!/usr/bin/env bash
# submit-ios.sh — the one blessed way to send a finished build to TestFlight.
#
# It exists for a single reason: `eas submit` evaluates app.config.js, and
# WITHOUT APP_VARIANT=production it resolves the DEVELOPMENT variant. The plain
# command fails with:
#
#   Looking up credentials configuration for com.osctulsa.pantryparty.dev...
#
# eas.json's per-profile `env` block does NOT cover this — it applies to builds
# only, the same trap that `eas update` has (see scripts/publish-ota.sh). Any
# command that reads app.config.js outside a build needs the shell variable.
#
# Usage:
#   scripts/submit-ios.sh                 # submit the latest finished build
#   scripts/submit-ios.sh <build-id>      # submit a specific build
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ID="${1:-}"

cd "$REPO_ROOT/apps/mobile"

ARGS=(submit --platform ios --profile production --non-interactive)
if [[ -n "$BUILD_ID" ]]; then
  ARGS+=(--id "$BUILD_ID")
  echo "› Submitting build $BUILD_ID"
else
  ARGS+=(--latest)
  echo "› Submitting the latest finished iOS build"
fi

APP_VARIANT=production npx eas-cli "${ARGS[@]}"

echo
echo "✔ Uploaded. Apple processes the binary for ~5-10 minutes, then it appears"
echo "  under the TestFlight tab. Internal testers get it automatically."
echo "  https://appstoreconnect.apple.com/apps/6788079875/testflight/ios"

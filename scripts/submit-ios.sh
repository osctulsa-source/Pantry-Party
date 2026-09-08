#!/usr/bin/env bash
# submit-ios.sh — the only way to send an IPA to TestFlight.
#
# Hard rules, each a TestFlight incident:
#   1. APP_VARIANT=production — bare `eas submit` looks up .dev (same trap as
#      `eas update`; eas.json env applies to builds only).
#   2. --path <ipa> only — `--latest` uploaded the wrong binary more than once.
#   3. inspect the IPA first — build 46 had no main.jsbundle and crashed on
#      launch. The archive now fails without JS, but inspect also checks widget
#      versions and EXUpdatesEnabled before Apple ever sees the file.
#
# Usage (from repo root):
#   npm run ios:submit -- apps/mobile/build-<id>.ipa
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "usage: npm run ios:submit -- path/to.ipa" >&2
  echo "       Do not use --latest or --id. Inspect a local IPA, then submit that file." >&2
  echo "       See docs/TESTFLIGHT.md." >&2
  exit 1
fi

for arg in "$@"; do
  case "$arg" in
    --latest|--id|--url)
      echo "✖ Refusing $arg. Submit a local IPA with --path after ios:inspect-ipa." >&2
      echo "  TestFlight 46 was an un-inspected binary. See docs/TESTFLIGHT.md." >&2
      exit 1
      ;;
  esac
done

IPA_ARG="$1"

resolve_ipa() {
  local p="$1"
  if [[ "$p" == /* && -f "$p" ]]; then
    echo "$p"
    return
  fi
  if [[ -f "$PWD/$p" ]]; then
    echo "$PWD/$p"
    return
  fi
  if [[ -f "$REPO_ROOT/$p" ]]; then
    echo "$REPO_ROOT/$p"
    return
  fi
  if [[ -f "$REPO_ROOT/apps/mobile/$p" ]]; then
    echo "$REPO_ROOT/apps/mobile/$p"
    return
  fi
  echo "✖ IPA not found: $p" >&2
  exit 1
}

IPA="$(resolve_ipa "$IPA_ARG")"

echo "› Inspecting $IPA"
node "$REPO_ROOT/scripts/inspect-ios-ipa.mjs" "$IPA"

cd "$REPO_ROOT/apps/mobile"
echo "› Submitting inspected IPA"
APP_VARIANT=production npx eas-cli submit --platform ios --profile production --path "$IPA" --non-interactive

echo
echo "✔ Uploaded. Apple processes the binary for ~5-10 minutes, then it appears"
echo "  under the TestFlight tab. Internal testers get it automatically."
echo "  Last known good until that build is installed: TestFlight 47."
echo "  https://appstoreconnect.apple.com/apps/6788079875/testflight/ios"

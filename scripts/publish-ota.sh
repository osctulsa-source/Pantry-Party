#!/usr/bin/env bash
# publish-ota.sh — gated wrapper around `eas update`. NOT a current ship path.
#
# updates.enabled is false (TestFlight 36/41/45, expo/expo#45154). This script
# still exists so nobody invents a raw `eas update`. check-ota-reachability.mjs
# exits 1 until updates are explicitly re-enabled AND a new binary is cut.
# Until then: docs/TESTFLIGHT.md — Mac-local build, inspect, submit that IPA.
#
# Wraps the raw `eas update` with the guardrails that past incidents proved
# necessary (see docs/TESTFLIGHT.md):
#   1. clean tree      — what you publish must be a commit someone can review
#   2. smoke reminder  — the Maestro flows pin bug classes that previously
#                        shipped (dead buttons, unreachable content)
#   3. APP_VARIANT     — without it app.config.js resolves the DEVELOPMENT
#                        variant (.dev bundle ids) and the update is fenced off
#                        from every installed production build
#   4. reachability    — refuses to publish onto a runtimeVersion the newest
#                        TestFlight build does not accept (builds 42/43 shipped
#                        fingerprint runtimes and can never receive an update)
#   5. sourcemaps      — uploads to Sentry when credentials are present, so
#                        OTA crash reports stay symbolicated
#
# Usage: scripts/publish-ota.sh "fix: what changed"
set -euo pipefail

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  echo "usage: scripts/publish-ota.sh \"<update message>\"" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/apps/mobile"

# 1. Provenance: refuse a dirty tree. An update is a release; it must correspond
#    to a commit, or nobody can tell later what testers are actually running.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✖ Working tree is dirty — commit or stash first, so the published bundle" >&2
  echo "  corresponds to a reviewable commit." >&2
  exit 1
fi

# 2. Reachability: refuse an update no installed build can accept. This is a
#    hard gate, not advice — a mismatched runtime publishes "successfully" and
#    reaches zero devices, which is indistinguishable from success until someone
#    notices days later that nothing changed on their phone.
echo "› Checking OTA reachability against the newest production build…"
node "$REPO_ROOT/scripts/check-ota-reachability.mjs"

# 3. Smoke gate (advisory — flows need a booted sim with the dev build).
echo "› Pre-publish smoke: run 'npm run smoke' against a booted sim if you haven't."
echo "  (.maestro/README.md — settings scroll, zone chips, cook-mode exit)"

# 4. Publish. --environment production also injects EAS server-side env vars
#    (EXPO_PUBLIC_*) into the exported bundle.
APP_VARIANT=production npx eas-cli update \
  --channel production \
  --environment production \
  --message "$MSG"

# 5. Sourcemaps: only when the Sentry upload credentials are configured.
if [[ -n "${SENTRY_AUTH_TOKEN:-}" && -n "${SENTRY_ORG:-}" && -n "${SENTRY_PROJECT:-}" ]]; then
  echo "› Uploading sourcemaps to Sentry ($SENTRY_ORG/$SENTRY_PROJECT)…"
  npx sentry-expo-upload-sourcemaps dist
else
  echo "⚠ Sourcemaps NOT uploaded (set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT" >&2
  echo "  to symbolicate OTA crash reports — see docs/TESTFLIGHT.md)." >&2
fi

echo "✔ Published. Reachability was verified before publishing, so installed"
echo "  builds will take it: they download on one launch and apply on the next."

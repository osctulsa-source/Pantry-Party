#!/usr/bin/env bash
# publish-ota.sh — the one blessed way to ship a JS-only change to TestFlight.
#
# Wraps the raw `eas update` with the guardrails that past incidents proved
# necessary (see docs/TESTFLIGHT.md):
#   1. clean tree      — a dirty tree changes the runtime fingerprint and the
#                        update silently reaches zero devices
#   2. smoke reminder  — the Maestro flows pin bug classes that previously
#                        shipped (dead buttons, unreachable content)
#   3. APP_VARIANT     — without it the dev-variant fingerprint is computed
#                        and, again, zero devices
#   4. sourcemaps      — uploads to Sentry when credentials are present, so
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

# 1. Fingerprint safety: refuse a dirty tree.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✖ Working tree is dirty — commit or stash first (a dirty tree changes" >&2
  echo "  the fingerprint and the update reaches zero devices)." >&2
  exit 1
fi

# 2. Smoke gate (advisory — flows need a booted sim with the dev build).
echo "› Pre-publish smoke: run 'npm run smoke' against a booted sim if you haven't."
echo "  (.maestro/README.md — settings scroll, zone chips, cook-mode exit)"

# 3. Publish. --environment production also injects EAS server-side env vars
#    (EXPO_PUBLIC_*) into the exported bundle.
APP_VARIANT=production npx eas-cli update \
  --channel production \
  --environment production \
  --message "$MSG"

# 4. Sourcemaps: only when the Sentry upload credentials are configured.
if [[ -n "${SENTRY_AUTH_TOKEN:-}" && -n "${SENTRY_ORG:-}" && -n "${SENTRY_PROJECT:-}" ]]; then
  echo "› Uploading sourcemaps to Sentry ($SENTRY_ORG/$SENTRY_PROJECT)…"
  npx sentry-expo-upload-sourcemaps dist
else
  echo "⚠ Sourcemaps NOT uploaded (set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT" >&2
  echo "  to symbolicate OTA crash reports — see docs/TESTFLIGHT.md)." >&2
fi

echo "✔ Published. Verify the printed Runtime version matches the live build's"
echo "  fingerprint (eas build:list) — a mismatch means zero devices got it."

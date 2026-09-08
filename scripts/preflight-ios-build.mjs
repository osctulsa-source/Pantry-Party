#!/usr/bin/env node
/**
 * preflight-ios-build.mjs — the gate every production iOS build must pass.
 *
 * Each check below corresponds to a way a TestFlight build has actually broken
 * in this repo. They are cheap; a failed EAS build is not. Run:
 *
 *   node scripts/preflight-ios-build.mjs             # verify, exit 1 on failure
 *   node scripts/preflight-ios-build.mjs --set-next  # bump ios.buildNumber, then verify
 *   node scripts/preflight-ios-build.mjs --offline   # skip the checks that call EAS
 *
 * Incidents encoded here:
 *   1. Builds 42/43 were made from commit f8ebd5c, which exists in neither the
 *      local repo nor GitHub — an agent's tree that was never pushed. The
 *      binaries in TestFlight had no reviewable source. -> clean tree + pushed HEAD.
 *   2. Builds 42/43 carry fingerprint runtimeVersions while app.config.js declares
 *      '1.0.0', so no OTA can ever reach them. -> explicit runtimeVersion required.
 *   3. autoIncrement ping-pong (#237 / #238): unsupported with a JS config under
 *      `local`, and its absence risks a duplicate build number. -> monotonic check.
 *   4. A stale untracked apps/mobile/ios/ was uploaded and silently overrode the
 *      configured build number, because EAS skips prebuild when one is present.
 *   5. expo-widgets hardcodes the widget extension to version 1, which is a fatal
 *      IPA mismatch. -> withWidgetVersionSync must be registered after it.
 *   6. `.dev` bundle ids ship when APP_VARIANT is not set at prebuild time.
 *   7. Build 46 shipped with expo-updates off and no main.jsbundle (Sentry
 *      wrapped the RN bundle phase as `/bin/sh`). Instant launch crash.
 *      -> withForceJsBundleEmbed + inspect IPA before submit.
 *   8. EAS build:list lagged ASC (45/46 on Apple, EAS still at 44).
 *      -> monotonic check against App Store Connect + a committed floor.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import {
  APP_CONFIG,
  EASIGNORE,
  EAS_JSON,
  MOBILE_DIR,
  REPO_ROOT,
  highestIssuedIosBuild,
  loadProductionConfig,
} from './lib/eas.mjs';

const { checkReleaseInvariants } = createRequire(import.meta.url)('./lib/release-invariants.cjs');

const argv = new Set(process.argv.slice(2));
const OFFLINE = argv.has('--offline');
const SET_NEXT = argv.has('--set-next');

const failures = [];
const notes = [];
const fail = (title, detail) => failures.push({ title, detail });
const ok = (msg) => notes.push(`  [ok] ${msg}`);

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

// ---------------------------------------------------------------------------
// 1. Source provenance — the build must be reproducible from a pushed commit.
// ---------------------------------------------------------------------------
function checkProvenance() {
  const dirty = sh('git', ['status', '--porcelain']);
  if (dirty) {
    fail(
      'Working tree is not clean',
      'EAS records the commit hash, not your working tree. Uncommitted work either\n' +
        'does not reach the build or produces a binary no commit describes — exactly\n' +
        'how the worklets fix ended up live in TestFlight with no source anywhere.\n' +
        'Commit or stash first:\n' +
        dirty
          .split('\n')
          .map((l) => `    ${l}`)
          .join('\n'),
    );
  } else {
    ok('working tree is clean');
  }

  const head = sh('git', ['rev-parse', 'HEAD']);
  let onRemote = false;
  try {
    onRemote = sh('git', ['branch', '-r', '--contains', head]).length > 0;
  } catch {
    onRemote = false;
  }
  if (!onRemote) {
    fail(
      'HEAD is not pushed to a remote',
      `Commit ${head.slice(0, 8)} exists only on this machine. Builds 42 and 43 were\n` +
        'made from commit f8ebd5c, which is in neither this repo nor GitHub — the\n' +
        'binaries in TestFlight have no reviewable source. Push the branch first:\n' +
        '    git push -u origin HEAD',
    );
  } else {
    ok(`HEAD (${head.slice(0, 8)}) exists on a remote`);
  }
}

// ---------------------------------------------------------------------------
// 2. Offline config invariants — shared with the CI test so they cannot drift.
//    See scripts/lib/release-invariants.cjs for what each one is protecting.
// ---------------------------------------------------------------------------
function checkInvariants(config) {
  const { failures: found, passed } = checkReleaseInvariants({
    config,
    easJson: JSON.parse(readFileSync(EAS_JSON, 'utf8')),
    easignore: readFileSync(EASIGNORE, 'utf8'),
  });
  passed.forEach(ok);
  found.forEach(({ title, detail }) => fail(title, detail));

  // Not an invariant of the committed config, just a local tidiness note: with
  // the .easignore un-ignore gone, a leftover ios/ can no longer reach EAS.
  if (existsSync(join(MOBILE_DIR, 'ios'))) {
    notes.push(
      '  [!] apps/mobile/ios/ exists locally. It is gitignored and no longer uploaded,\n' +
        '      so it cannot affect the build — but delete it to avoid confusion.',
    );
  } else {
    ok('no local apps/mobile/ios/ to go stale');
  }
}

// ---------------------------------------------------------------------------
// 3. Build number must exceed every stamp Apple already has.
// ---------------------------------------------------------------------------
function checkBuildNumber(config) {
  const local = Number.parseInt(config?.ios?.buildNumber, 10);
  if (!Number.isFinite(local)) {
    fail('ios.buildNumber is not a number', `Got ${JSON.stringify(config?.ios?.buildNumber)}.`);
    return;
  }

  if (OFFLINE) {
    notes.push(`  [!] --offline: build ${local} was NOT verified against App Store Connect. Do not ship on this.`);
    return;
  }

  let highest;
  try {
    highest = highestIssuedIosBuild();
  } catch (err) {
    fail(
      'Could not read issued iOS build numbers from EAS / App Store Connect',
      `${String(err.message).split('\n')[0]}\n` +
        'Run `npx eas-cli login` in apps/mobile. The monotonic check must see ASC,\n' +
        'not only `eas build:list` — local builds 45/46 were on TestFlight while EAS\n' +
        'still reported 44. Use --offline only when you have verified the number another way.',
    );
    return;
  }

  if (local <= highest) {
    fail(
      `ios.buildNumber ${local} is not greater than the highest issued build (${highest})`,
      'App Store Connect rejects a duplicate (version, build) pair, and the upload\n' +
        'fails after the build has already run. That highest includes TestFlight stamps\n' +
        'from `eas submit:status` plus a committed floor (scripts/lib/ios-build-numbers.cjs).\n' +
        'Bump it:\n' +
        '    node scripts/preflight-ios-build.mjs --set-next',
    );
  } else {
    ok(`ios.buildNumber ${local} > highest issued ${highest} (ASC + EAS + floor)`);
  }
}

function setNext() {
  const src = readFileSync(APP_CONFIG, 'utf8');
  const match = src.match(/(\n\s*buildNumber:\s*')(\d+)(')/);
  if (!match) {
    console.error("[x] Could not find `buildNumber: '<n>'` in app.config.js — bump it by hand.");
    process.exit(1);
  }
  const current = Number.parseInt(match[2], 10);
  const highest = OFFLINE ? current : highestIssuedIosBuild();
  const next = Math.max(highest + 1, current);
  if (next === current) {
    console.log(`> ios.buildNumber is already ${next} (highest issued: ${highest}). Unchanged.`);
    return;
  }
  writeFileSync(APP_CONFIG, src.replace(match[0], `${match[1]}${next}${match[3]}`), 'utf8');
  console.log(`> ios.buildNumber ${current} -> ${next} (highest issued: ${highest}).`);
  console.log('  Commit this before building — the gate requires a clean, pushed tree.');
  console.log('  After this IPA is on TestFlight, bump LAST_KNOWN_ASC_BUILD in');
  console.log('  scripts/lib/ios-build-numbers.cjs to the new number.');
}

// ---------------------------------------------------------------------------

if (SET_NEXT) setNext();

const config = loadProductionConfig();
checkProvenance();
checkInvariants(config);
checkBuildNumber(config);

console.log('\niOS build preflight\n');
console.log(notes.join('\n'));

if (failures.length === 0) {
  console.log('\n[PASS] All checks passed. Safe to run (Mac, from repo root):');
  console.log('    cd apps/mobile && eas build --platform ios --profile production --local --non-interactive');
  console.log('    npm run ios:inspect-ipa -- apps/mobile/build-<id>.ipa');
  console.log('    npm run ios:submit -- apps/mobile/build-<id>.ipa\n');
  process.exit(0);
}

console.log(`\n[FAIL] ${failures.length} check(s) failed:\n`);
for (const { title, detail } of failures) {
  console.log(`  [x] ${title}`);
  console.log(
    `${detail
      .split('\n')
      .map((l) => `      ${l}`)
      .join('\n')}\n`,
  );
}
console.log('Fix the above, then re-run. See docs/TESTFLIGHT.md.\n');
process.exit(1);

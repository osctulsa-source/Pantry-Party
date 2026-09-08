#!/usr/bin/env node
/**
 * inspect-ios-ipa.mjs — refuse to submit a Release IPA that cannot launch.
 *
 * TestFlight build 46 had EXUpdatesEnabled=false and no main.jsbundle. With
 * updates off, AppDelegate looks for Bundle.main.url("main", "jsbundle") and
 * dies immediately: "No script URL provided". Unzip the IPA and fail loud
 * before Apple ever sees it.
 *
 *   node scripts/inspect-ios-ipa.mjs path/to.ipa
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MIN_JSBUNDLE_BYTES = 50_000;

const ipa = process.argv[2];
if (!ipa) {
  console.error('Usage: node scripts/inspect-ios-ipa.mjs <path.ipa>');
  process.exit(1);
}
if (!existsSync(ipa)) {
  console.error(`[x] IPA not found: ${ipa}`);
  process.exit(1);
}

const listing = execFileSync('unzip', ['-Z', '-1', ipa], { encoding: 'utf8' });
const appRoots = [
  ...new Set(
    listing
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('Payload/') && l.includes('.app/'))
      .map((l) => l.slice(0, l.indexOf('.app/') + 4)),
  ),
];

if (appRoots.length === 0) {
  console.error('[x] IPA has no Payload/*.app');
  process.exit(1);
}

const hostApp = appRoots.find((p) => !p.includes('PlugIns') && !p.includes('Watch')) ?? appRoots[0];
const failures = [];
const notes = [];

function fail(msg) {
  failures.push(msg);
}
function ok(msg) {
  notes.push(`  [ok] ${msg}`);
}

const dir = mkdtempSync(join(tmpdir(), 'ipa-inspect-'));
try {
  execFileSync('unzip', ['-q', '-o', ipa, '-d', dir, `${hostApp}/*`], { stdio: 'pipe' });
  const appDir = join(dir, hostApp);

  const jsbundle = join(appDir, 'main.jsbundle');
  if (!existsSync(jsbundle)) {
    fail(
      'main.jsbundle is missing. AppDelegate Release looks for this file when ' +
        'expo-updates is off. This is TestFlight build 46. Do not submit.',
    );
  } else {
    const size = statSync(jsbundle).size;
    if (size < MIN_JSBUNDLE_BYTES) {
      fail(`main.jsbundle is ${size} bytes (need ≥ ${MIN_JSBUNDLE_BYTES}). Treat as empty.`);
    } else {
      ok(`main.jsbundle is ${(size / 1024).toFixed(0)} KB`);
    }
  }

  const expoPlist = join(appDir, 'Expo.plist');
  if (existsSync(expoPlist)) {
    const expoText = plutilJson(expoPlist);
    if (expoText.EXUpdatesEnabled === true || expoText.EXUpdatesEnabled === 'true') {
      fail(
        'Expo.plist has EXUpdatesEnabled=true. Builds 36/41/45 abort at ' +
          'RelaunchProcedure.swift:94. Keep updates.enabled false until expo/expo#45154 is fixed.',
      );
    } else {
      ok(`EXUpdatesEnabled=${String(expoText.EXUpdatesEnabled)}`);
    }
  } else {
    ok('no Expo.plist (updates not in the binary)');
  }

  const info = plutilJson(join(appDir, 'Info.plist'));
  const version = info.CFBundleShortVersionString;
  const build = info.CFBundleVersion;
  ok(`host app ${version} (${build})`);

  const widgetPlist = listing
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /PlugIns\/ExpoWidgetsTarget\.appex\/Info\.plist$/.test(l));
  if (widgetPlist) {
    execFileSync('unzip', ['-q', '-o', ipa, '-d', dir, widgetPlist], { stdio: 'pipe' });
    const widgetInfo = plutilJson(join(dir, widgetPlist));
    ok(`widget ${widgetInfo.CFBundleShortVersionString} (${widgetInfo.CFBundleVersion})`);
    if (String(widgetInfo.CFBundleVersion) !== String(build)) {
      fail(
        `Widget CFBundleVersion ${widgetInfo.CFBundleVersion} ≠ app ${build}. ` +
          'Fatal IPA mismatch (builds 41/42).',
      );
    }
    if (String(widgetInfo.CFBundleShortVersionString) !== String(version)) {
      fail(
        `Widget CFBundleShortVersionString ${widgetInfo.CFBundleShortVersionString} ≠ app ${version}.`,
      );
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('\nIPA inspect\n');
console.log(`  file: ${ipa}`);
console.log(notes.join('\n'));

if (failures.length === 0) {
  console.log('\n[PASS] Safe to submit this IPA.\n');
  process.exit(0);
}

console.log(`\n[FAIL] ${failures.length} check(s):\n`);
for (const msg of failures) {
  console.log(`  [x] ${msg}\n`);
}
process.exit(1);

function plutilJson(path) {
  const raw = execFileSync('plutil', ['-convert', 'json', '-o', '-', path], { encoding: 'utf8' });
  return JSON.parse(raw);
}

/**
 * Shared helpers for the iOS release guardrails.
 *
 * eas-cli is not a workspace dependency — it is invoked through npx. On Windows
 * that resolves to `npx.cmd`, and Node 20+ refuses to execFile a `.cmd` without
 * a shell (CVE-2024-27980), failing with `spawnSync npx.cmd EINVAL`. Hence the
 * platform-conditional `shell` option below; keep it, or these scripts silently
 * stop working on the machine that actually ships the builds.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MOBILE_DIR = join(REPO_ROOT, 'apps', 'mobile');
export const APP_CONFIG = join(MOBILE_DIR, 'app.config.js');
export const EAS_JSON = join(MOBILE_DIR, 'eas.json');
export const EASIGNORE = join(REPO_ROOT, '.easignore');

const require = createRequire(import.meta.url);
const {
  LAST_KNOWN_ASC_BUILD,
  numbersFromEasBuilds,
  numbersFromAscStatus,
  highestIssued,
} = require('./ios-build-numbers.cjs');

export { LAST_KNOWN_ASC_BUILD, numbersFromEasBuilds, numbersFromAscStatus, highestIssued };

const IS_WINDOWS = process.platform === 'win32';

/**
 * Run eas-cli via npx and return stdout.
 *
 * APP_VARIANT=production is always set: eas-cli evaluates app.config.js, and
 * without the variant it resolves com.osctulsa.pantryparty.dev (the same trap
 * as a bare `eas submit`). `eas submit:status` failed that way until this env
 * was forced here.
 */
export function eas(args) {
  return execFileSync(IS_WINDOWS ? 'npx.cmd' : 'npx', ['eas-cli', ...args], {
    cwd: MOBILE_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
    shell: IS_WINDOWS,
    env: { ...process.env, APP_VARIANT: 'production' },
  });
}

/**
 * Recent iOS builds, newest first. eas-cli prints an upgrade banner before the
 * JSON, so the payload is sliced from the first `[`.
 */
export function iosBuilds(limit = 50) {
  const raw = eas(['build:list', '--platform', 'ios', '--limit', String(limit), '--non-interactive', '--json']);
  return JSON.parse(raw.slice(raw.indexOf('[')));
}

/**
 * Live TestFlight stamps from App Store Connect. Mac-local EAS builds (45/46)
 * were on Apple while `eas build:list` still topped out at 44.
 */
export function ascTestFlightStatus() {
  const raw = eas([
    'submit:status',
    '--platform',
    'ios',
    '--profile',
    'production',
    '--json',
    '--non-interactive',
  ]);
  const start = raw.search(/[{[]/);
  return JSON.parse(raw.slice(start));
}

/**
 * Highest iOS CFBundleVersion already issued, from ASC + EAS + a committed floor.
 */
export function highestIssuedIosBuild() {
  const easNumbers = numbersFromEasBuilds(iosBuilds());
  const ascNumbers = numbersFromAscStatus(ascTestFlightStatus());
  return highestIssued([easNumbers, ascNumbers]);
}

/**
 * Evaluate app.config.js the way a production build does. The config reads
 * process.env.APP_VARIANT at module scope, so it is set before evaluation and
 * restored afterwards.
 */
export function loadProductionConfig() {
  const src = readFileSync(APP_CONFIG, 'utf8');
  const configRequire = createRequire(APP_CONFIG);
  const previous = process.env.APP_VARIANT;
  process.env.APP_VARIANT = 'production';
  try {
    const mod = { exports: {} };
    new Function('module', 'exports', 'process', 'require', src)(mod, mod.exports, process, configRequire);
    return mod.exports.expo;
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
  }
}

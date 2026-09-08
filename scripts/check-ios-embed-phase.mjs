#!/usr/bin/env node
/**
 * check-ios-embed-phase.mjs — prove the generated Xcode project embeds JS.
 *
 * Plugin listing in app.config.js is necessary but not sufficient. Sentry and
 * PostHog rewrite the "Bundle React Native code and images" phase; listing
 * withForceJsBundleEmbed first makes it *run last* and replace that wrap with
 * embed-jsbundle.sh. A Sentry/PostHog upgrade can restore
 * `/bin/sh sentry-xcode.sh /bin/sh …` (TestFlight 46) without touching our
 * plugin file. This job prebuilds and reads the pbxproj.
 *
 *   node scripts/check-ios-embed-phase.mjs
 *   node scripts/check-ios-embed-phase.mjs --keep-ios
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { MOBILE_DIR } from './lib/eas.mjs';

const { assertEmbedPhase } = createRequire(import.meta.url)('./lib/ios-embed-phase.cjs');

const KEEP = process.argv.includes('--keep-ios');
const iosDir = join(MOBILE_DIR, 'ios');
const embedScript = join(iosDir, 'scripts', 'embed-jsbundle.sh');

function findPbxproj() {
  if (!existsSync(iosDir)) {
    throw new Error(`prebuild did not create ${iosDir}`);
  }
  const projects = readdirSync(iosDir).filter((n) => n.endsWith('.xcodeproj'));
  if (projects.length !== 1) {
    throw new Error(`expected one .xcodeproj under ios/, got ${JSON.stringify(projects)}`);
  }
  return join(iosDir, projects[0], 'project.pbxproj');
}

try {
  execFileSync('npx', ['expo', 'prebuild', '--platform', 'ios', '--no-install', '--clean'], {
    cwd: MOBILE_DIR,
    encoding: 'utf8',
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_VARIANT: 'production',
      CI: '1',
    },
  });

  if (!existsSync(embedScript)) {
    throw new Error(`prebuild did not copy ${embedScript}`);
  }

  assertEmbedPhase(readFileSync(findPbxproj(), 'utf8'));
  console.log('[ok] RN bundle phase invokes embed-jsbundle.sh (no sentry-xcode.sh wrap)');
} finally {
  if (!KEEP && existsSync(iosDir)) {
    rmSync(iosDir, { recursive: true, force: true });
  }
}

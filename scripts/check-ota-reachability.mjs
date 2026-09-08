#!/usr/bin/env node
/**
 * check-ota-reachability.mjs — refuse to publish an OTA that no device can receive.
 *
 * An `eas update` targets the runtimeVersion that app.config.js resolves to. An
 * installed build only accepts updates matching the runtimeVersion baked into it
 * at build time. When those diverge the publish still "succeeds" — it just
 * reaches zero devices, silently, and you find out days later.
 *
 * That is not hypothetical here. TestFlight builds 42 and 43 shipped fingerprint
 * runtimeVersions (f16fc241..., de3e88e3...) because they were built from a tree
 * that still used `policy: 'fingerprint'`, while this repo declares the explicit
 * string '1.0.0'. Every update published from main is invisible to them.
 *
 * This compares the runtimeVersion this repo would publish against the one baked
 * into the most recent finished production iOS build, and exits non-zero when
 * they differ. Called by scripts/publish-ota.sh.
 *
 * While updates.enabled is not true, this exits first: OTA is not a ship path.
 * Last known good TestFlight is 47. JS changes wait for a full Mac-local build.
 *
 *   node scripts/check-ota-reachability.mjs
 */
import { iosBuilds, loadProductionConfig } from './lib/eas.mjs';

const config = loadProductionConfig();
const local = config?.runtimeVersion;

if (config?.updates?.enabled !== true) {
  console.error('[x] OTA publishing is blocked. updates.enabled is not true.');
  console.error('    Builds 36/41/45 die at RelaunchProcedure.swift:94 (expo/expo#45154).');
  console.error('    Keep updates.enabled false until that unwrap is gone, then cut a new');
  console.error('    binary. Last known good TestFlight: 47. Cut a full build for JS changes.');
  process.exit(1);
}

if (typeof local !== 'string') {
  console.error('[x] app.config.js runtimeVersion is not an explicit string.');
  console.error('    A fingerprint policy gives every build its own runtime, so an update can');
  console.error('    only ever reach one exact binary. Use an explicit string.');
  process.exit(1);
}

let build;
try {
  build = iosBuilds().find((b) => b.status === 'FINISHED' && b.buildProfile === 'production');
} catch (err) {
  console.error(`[x] Could not read the build list from EAS: ${String(err.message).split('\n')[0]}`);
  console.error('    Run `npx eas-cli login` in apps/mobile.');
  process.exit(1);
}

if (!build) {
  console.error('[x] No finished production iOS build found — nothing to publish an update to.');
  process.exit(1);
}

const remote = build.runtimeVersion;
const label = `build ${build.appBuildVersion} (${build.createdAt?.slice(0, 10)}, commit ${String(
  build.gitCommitHash ?? '',
).slice(0, 8)})`;

if (remote !== local) {
  console.error('[x] This update would reach ZERO devices.\n');
  console.error(`    publishing runtimeVersion : ${local}`);
  console.error(`    latest production build   : ${remote}`);
  console.error(`    that build                : ${label}\n`);
  console.error('    The newest TestFlight binary does not accept updates on this runtime.');
  console.error('    Cut a full build from current main so the installed runtime matches:');
  console.error('      node scripts/preflight-ios-build.mjs --set-next');
  console.error('      cd apps/mobile && eas build --platform ios --profile production');
  process.exit(1);
}

console.log(`[ok] runtimeVersion ${local} matches the latest production build — ${label}.`);

/**
 * ios-build-numbers.cjs — pure helpers for the iOS monotonic build-number gate.
 *
 * TestFlight 45/46 existed on App Store Connect while `eas build:list` still
 * reported 44 (Mac-local EAS builds are easy to miss). The next number must be
 * greater than every stamp Apple already has, not only what EAS remembers.
 *
 * LAST_KNOWN_ASC_BUILD is a floor: bump it when a production IPA is submitted
 * so a stale API reply cannot walk the number backwards.
 */
const LAST_KNOWN_ASC_BUILD = 47;

function parseBuildInt(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

function numbersFromEasBuilds(builds) {
  return (builds ?? []).map((b) => parseBuildInt(b?.appBuildVersion)).filter((n) => n !== null);
}

function numbersFromAscStatus(status) {
  return (status?.ios?.testFlightBuilds ?? [])
    .map((b) => parseBuildInt(b?.buildNumber))
    .filter((n) => n !== null);
}

function highestIssued(groups) {
  const all = [LAST_KNOWN_ASC_BUILD];
  for (const group of groups ?? []) {
    all.push(...group);
  }
  return Math.max(0, ...all);
}

module.exports = {
  LAST_KNOWN_ASC_BUILD,
  parseBuildInt,
  numbersFromEasBuilds,
  numbersFromAscStatus,
  highestIssued,
};

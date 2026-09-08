const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  LAST_KNOWN_ASC_BUILD,
  numbersFromEasBuilds,
  numbersFromAscStatus,
  highestIssued,
} = require('./ios-build-numbers.cjs');

describe('ios-build-numbers', () => {
  it('reads EAS appBuildVersion integers', () => {
    assert.deepEqual(
      numbersFromEasBuilds([{ appBuildVersion: '44' }, { appBuildVersion: 'nope' }]),
      [44],
    );
  });

  it('reads App Store Connect TestFlight build numbers (the 45/46 gap)', () => {
    const status = {
      ios: {
        testFlightBuilds: [{ buildNumber: '47' }, { buildNumber: '46' }, { buildNumber: '45' }],
      },
    };
    assert.deepEqual(numbersFromAscStatus(status), [47, 46, 45]);
  });

  it('never goes below the last known ASC stamp even if EAS is stale', () => {
    assert.equal(highestIssued([[44]]), LAST_KNOWN_ASC_BUILD);
    assert.equal(highestIssued([[48], [47]]), 48);
  });
});

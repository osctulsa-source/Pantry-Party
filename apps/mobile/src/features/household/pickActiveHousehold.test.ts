import { pickActiveHouseholdId } from './pickActiveHousehold';

const OLD = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NEW = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('pickActiveHouseholdId', () => {
  it('returns null with no memberships and no pref', () => {
    expect(pickActiveHouseholdId([], null, new Set())).toBeNull();
  });

  it('returns a bootstrap hint when memberships have not downloaded yet', () => {
    expect(pickActiveHouseholdId([], OLD, new Set())).toBe(OLD);
  });

  it('uses a bootstrap hint instead of a single empty local household', () => {
    expect(pickActiveHouseholdId([OLD], NEW, new Set())).toBe(NEW);
  });

  it('keeps the only stocked household even if a hint is pending', () => {
    expect(pickActiveHouseholdId([OLD], NEW, new Set([OLD]))).toBe(OLD);
  });

  it('prefers a bootstrap household over an older empty duplicate', () => {
    expect(pickActiveHouseholdId([OLD, NEW], NEW, new Set())).toBe(NEW);
  });

  it('returns the only membership when there is no other hint', () => {
    expect(pickActiveHouseholdId([OLD], null, new Set())).toBe(OLD);
  });

  it('ignores a stored pref that is not a membership', () => {
    expect(pickActiveHouseholdId([OLD, NEW], 'not-a-member', new Set([OLD]))).toBe(OLD);
  });

  it('keeps a stored pref that still has food', () => {
    expect(pickActiveHouseholdId([OLD, NEW], NEW, new Set([NEW]))).toBe(NEW);
  });

  it('abandons an empty stored pref when another household has food', () => {
    expect(pickActiveHouseholdId([OLD, NEW], NEW, new Set([OLD]))).toBe(OLD);
  });

  it('falls back to the oldest membership when nothing is stocked', () => {
    expect(pickActiveHouseholdId([OLD, NEW], null, new Set())).toBe(OLD);
  });
});

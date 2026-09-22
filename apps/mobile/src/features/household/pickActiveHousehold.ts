/**
 * Pick which household a device should show.
 *
 * A new phone can briefly create a second empty household before the original
 * memberships download. Prefer a membership that already has pantry items,
 * then a stored/bootstrap preference, then the oldest membership. Honor a
 * bootstrap hint even before that id is a local membership, unless the only
 * local household already has food.
 */

export function pickActiveHouseholdId(
  membershipIdsOldestFirst: readonly string[],
  storedPref: string | null,
  householdsWithItems: ReadonlySet<string>,
): string | null {
  if (membershipIdsOldestFirst.length === 0) return storedPref;

  const stocked = membershipIdsOldestFirst.filter((id) => householdsWithItems.has(id));
  const prefOk =
    storedPref != null && membershipIdsOldestFirst.includes(storedPref) ? storedPref : null;
  const prefPending =
    storedPref != null && !membershipIdsOldestFirst.includes(storedPref) ? storedPref : null;

  if (membershipIdsOldestFirst.length === 1) {
    const only = membershipIdsOldestFirst[0] ?? null;
    if (prefPending && only != null && !householdsWithItems.has(only)) return prefPending;
    return only;
  }

  if (prefOk) {
    const prefIsEmptyDuplicate = stocked.length > 0 && !householdsWithItems.has(prefOk);
    if (!prefIsEmptyDuplicate) return prefOk;
  }
  if (prefPending && stocked.length === 0) return prefPending;

  return stocked[0] ?? membershipIdsOldestFirst[0] ?? null;
}

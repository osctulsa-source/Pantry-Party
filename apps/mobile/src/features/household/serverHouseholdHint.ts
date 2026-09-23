/**
 * Server-confirmed household from POST /household/bootstrap.
 *
 * A new phone can sit with zero local memberships (or an empty duplicate)
 * while PowerSync is still downloading. The bootstrap id is the pantry that
 * already exists in Postgres — ActiveHouseholdContext prefers it so invite
 * and pantry queries don't target a local-only household. Returning accounts
 * (`created: false`) also skip first-run onboarding on a fresh device.
 */

type HintListener = (id: string | null) => void;
type ExistingListener = (existing: boolean) => void;

let current: string | null = null;
let existingAccount = false;
const hintListeners = new Set<HintListener>();
const existingListeners = new Set<ExistingListener>();

export function getServerHouseholdHint(): string | null {
  return current;
}

export function isExistingServerHousehold(): boolean {
  return existingAccount;
}

export function setServerHouseholdHint(id: string): void {
  current = id;
  for (const listener of hintListeners) listener(id);
}

export function markExistingServerHousehold(): void {
  if (existingAccount) return;
  existingAccount = true;
  for (const listener of existingListeners) listener(true);
}

export function clearServerHouseholdHint(): void {
  current = null;
  existingAccount = false;
  for (const listener of hintListeners) listener(null);
  for (const listener of existingListeners) listener(false);
}

export function subscribeServerHouseholdHint(listener: HintListener): () => void {
  hintListeners.add(listener);
  return () => {
    hintListeners.delete(listener);
  };
}

export function subscribeExistingServerHousehold(listener: ExistingListener): () => void {
  existingListeners.add(listener);
  return () => {
    existingListeners.delete(listener);
  };
}

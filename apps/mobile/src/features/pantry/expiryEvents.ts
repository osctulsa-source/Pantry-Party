/**
 * On-device expiry-outcome log: what happened to items that needed attention.
 *
 * 'used'   — the item was consumed (a rescue when it was in the warning zone).
 * 'tossed' — the item was wasted. Voluntary, honest data — never required.
 *
 * Together with cookLog this seeds November's motivation arc (positive-action
 * streaks + "you saved ~$X" math) without a new synced table — same
 * local-first discipline as cookLog: per-household AsyncStorage, newest first,
 * capped, best-effort (bookkeeping must never break the flow that records it).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ExpiryEventKind = 'used' | 'tossed';

export interface ExpiryEvent {
  kind: ExpiryEventKind;
  itemName: string;
  /** ISO timestamp of the action. */
  at: string;
}

const MAX_EVENTS = 200;
const storageKey = (householdId: string) => `expiryEvents:${householdId}`;

export async function recordExpiryEvents(
  householdId: string | null,
  events: ExpiryEvent[],
): Promise<void> {
  if (!householdId || events.length === 0) return;
  try {
    const raw = await AsyncStorage.getItem(storageKey(householdId));
    const prior: ExpiryEvent[] = raw ? (JSON.parse(raw) as ExpiryEvent[]) : [];
    const next = [...events, ...prior].slice(0, MAX_EVENTS);
    await AsyncStorage.setItem(storageKey(householdId), JSON.stringify(next));
  } catch {
    // Best-effort log — never let bookkeeping break the action.
  }
}

export async function readExpiryEvents(householdId: string | null): Promise<ExpiryEvent[]> {
  if (!householdId) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(householdId));
    return raw ? (JSON.parse(raw) as ExpiryEvent[]) : [];
  } catch {
    return [];
  }
}

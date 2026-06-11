/**
 * On-device cook-event log.
 *
 * Seeds the future streak / insights mechanics ("days you cooked from your
 * pantry") without a new synced table — the strategy position measures streaks
 * on POSITIVE, observable actions (confirmed cooks), never self-reported waste.
 * Per-household key in AsyncStorage, newest first, capped. Best-effort: a
 * bookkeeping failure must never break the cook flow.
 *
 * When streaks ship server-side, this log becomes the migration seed; until
 * then it is deliberately local-only (no schema, sync-rule, or publication
 * changes — see the publication allowlist discipline in infra/local-dev).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CookEvent {
  recipeId: number;
  recipeTitle: string;
  /** ISO timestamp of the confirmation. */
  cookedAt: string;
  /** How many pantry items the user marked used/decremented. */
  itemsUsed: number;
}

const MAX_EVENTS = 100;
const storageKey = (householdId: string) => `cookLog:${householdId}`;

export async function recordCookEvent(
  householdId: string | null,
  event: CookEvent,
): Promise<void> {
  if (!householdId) return;
  try {
    const raw = await AsyncStorage.getItem(storageKey(householdId));
    const prior: CookEvent[] = raw ? (JSON.parse(raw) as CookEvent[]) : [];
    const next = [event, ...prior].slice(0, MAX_EVENTS);
    await AsyncStorage.setItem(storageKey(householdId), JSON.stringify(next));
  } catch {
    // Best-effort log — never let bookkeeping break the cook flow.
  }
}

export async function readCookEvents(householdId: string | null): Promise<CookEvent[]> {
  if (!householdId) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(householdId));
    return raw ? (JSON.parse(raw) as CookEvent[]) : [];
  } catch {
    return [];
  }
}

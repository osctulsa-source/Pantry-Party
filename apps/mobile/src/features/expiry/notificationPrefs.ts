/**
 * notificationPrefs — the reminder-time preference (on-device, AsyncStorage).
 *
 * The digest hour was hardcoded to 9am; this makes it a small, deliberate
 * choice (Settings → Reminders). Device-local rather than synced: when your
 * phone reminds you is a personal rhythm, not household state.
 *
 * Plain async functions (not a hook) because the consumer is the notification
 * reconciler, which runs outside React. The Settings UI wraps these with its
 * own state.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NOTIFY_LOCAL_HOUR } from '@breadbox/core';

const KEY = 'notifyHour';

/** The choices Settings offers. Small on purpose — a time picker is overkill. */
export const NOTIFY_HOUR_OPTIONS: Array<{ hour: number; label: string }> = [
  { hour: 8, label: '8 am' },
  { hour: 9, label: '9 am' },
  { hour: 12, label: 'Noon' },
  { hour: 18, label: '6 pm' },
];

export async function getNotifyHour(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : NOTIFY_LOCAL_HOUR;
  } catch {
    return NOTIFY_LOCAL_HOUR;
  }
}

export async function setNotifyHour(hour: number): Promise<void> {
  await AsyncStorage.setItem(KEY, String(hour));
}

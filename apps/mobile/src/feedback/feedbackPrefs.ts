/**
 * feedbackPrefs — the Sounds / Haptic-feedback toggles (on-device, AsyncStorage).
 *
 * Device-local like notificationPrefs: how loud your phone is, is a personal
 * choice, not household state. A module-level cache makes reads SYNCHRONOUS so
 * feedback calls on hot paths (check-offs) never await storage; hydrate runs
 * at import and on demand.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FeedbackPrefs {
  sounds: boolean;
  haptics: boolean;
}

const KEYS = { sounds: 'feedback.sounds', haptics: 'feedback.haptics' } as const;

let cache: FeedbackPrefs = { sounds: true, haptics: true };

export async function hydrateFeedbackPrefs(): Promise<FeedbackPrefs> {
  try {
    const [s, h] = await Promise.all([
      AsyncStorage.getItem(KEYS.sounds),
      AsyncStorage.getItem(KEYS.haptics),
    ]);
    cache = { sounds: s !== 'off', haptics: h !== 'off' };
  } catch {
    // Storage hiccup — keep the defaults; feedback must never break the app.
  }
  return cache;
}

export function getFeedbackPrefs(): FeedbackPrefs {
  return cache;
}

export async function setFeedbackPref(key: keyof FeedbackPrefs, value: boolean): Promise<void> {
  cache = { ...cache, [key]: value };
  try {
    await AsyncStorage.setItem(KEYS[key], value ? 'on' : 'off');
  } catch {
    // Cache already updated — worst case the choice doesn't survive a relaunch.
  }
}

// Warm the cache as soon as the module loads (fire-and-forget).
void hydrateFeedbackPrefs();

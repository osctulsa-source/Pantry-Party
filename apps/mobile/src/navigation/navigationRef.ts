/**
 * navigationRef — imperative navigation for code that lives outside the
 * component tree (notification response handlers).
 *
 * The expiry digest's default tap carries data.screen = 'expiring'; the
 * handler in notificationActions.ts runs in a plain listener with no React
 * context, so it navigates through this ref. On a cold start the response is
 * replayed before the container mounts — navigateWhenReady retries briefly
 * instead of dropping the intent on the floor.
 */
import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from '../../App';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const RETRY_MS = 250;
const MAX_TRIES = 20; // ~5s — beyond that the app is stuck on auth/onboarding anyway

/**
 * Navigate as soon as the container is ready. Safe to call from cold-start
 * paths; silently gives up if the container never becomes ready (e.g. the
 * user was signed out and landed on the auth stack, which has no such route).
 */
export function navigateWhenReady<Name extends keyof RootStackParamList>(
  name: Name,
  params?: RootStackParamList[Name],
  tries = 0,
): void {
  if (navigationRef.isReady()) {
    // The auth/onboarding trees don't mount the root stack; getRootState()
    // exists but the simplest guard is try/catch — navigate throws when the
    // route isn't registered in the current tree.
    try {
      // @ts-expect-error — params spread matches the overloaded signature at runtime.
      navigationRef.navigate(name, params);
    } catch {
      // Route not available (signed out / onboarding) — drop the intent.
    }
    return;
  }
  if (tries >= MAX_TRIES) return;
  setTimeout(() => navigateWhenReady(name, params, tries + 1), RETRY_MS);
}

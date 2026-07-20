/**
 * Routes a tapped announcement notification to the right screen using the
 * shared navigationRef. Shopping-run + runner-summary → Shopping tab; cooking →
 * Cook tab / Recipe Detail. Attach once at app launch.
 *
 * Cold-start safe: a tap that launches the app from a killed process isn't
 * delivered through the live listener AND the navigation container isn't ready
 * yet, so we (a) replay the launch response via getLastNotificationResponseAsync
 * and (b) route through navigateWhenReady, which retries until the container
 * mounts instead of dropping the intent. The dup-guard keeps the overlap
 * between the live listener and the launch replay safe. (Mirrors the expiry
 * handler in notificationActions.ts.)
 */
import * as Notifications from 'expo-notifications';

import { navigateWhenReady } from '../../navigation/navigationRef';

const handledResponses = new Set<string>();

function routeAnnouncementResponse(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as
    | { kind?: string; recipeId?: string }
    | undefined;
  if (!data) return;

  const dupKey = `${response.notification.request.identifier}:announce`;
  if (handledResponses.has(dupKey)) return;
  handledResponses.add(dupKey);

  if (data.kind === 'cooking' && data.recipeId) {
    // Partial recipe (id only) — RecipeDetail hydrates the rest. navigateWhenReady
    // is strongly typed against the full param, so cast the partial payload.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigateWhenReady('RecipeDetail', { recipe: { id: Number(data.recipeId) } } as any);
    return;
  }
  if (data.kind === 'shopping_run' || data.kind === 'runner_summary') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigateWhenReady('MainTabs', { screen: 'ShoppingTab' } as any);
  }
}

export function attachAnnouncementResponder(): { remove: () => void } {
  const sub = Notifications.addNotificationResponseReceivedListener(routeAnnouncementResponse);
  // A tap that launched the app (process was dead) is only available here — the
  // dup-guard makes the overlap with the live listener safe.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) routeAnnouncementResponse(response);
    })
    .catch(() => {});
  return sub;
}

/**
 * Routes a tapped announcement notification to the right screen using the
 * shared navigationRef. Shopping-run + runner-summary → Shopping tab; cooking →
 * Cook tab / Recipe Detail. Attach once at app launch.
 */
import * as Notifications from 'expo-notifications';

import { navigationRef } from '../../navigation/navigationRef';

export function attachAnnouncementResponder(): { remove: () => void } {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | { kind?: string; recipeId?: string }
      | undefined;
    if (!data) return;
    if (!navigationRef.isReady()) return;
    if (data.kind === 'cooking' && data.recipeId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigationRef as any).navigate('RecipeDetail', { recipe: { id: Number(data.recipeId) } });
      return;
    }
    if (data.kind === 'shopping_run' || data.kind === 'runner_summary') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigationRef as any).navigate('MainTabs', { screen: 'ShoppingTab' });
    }
  });
  return sub;
}

/**
 * Root navigation ref — lets non-React callers (expiry notification open)
 * jump to Cook with use-it-up context without a React tree.
 */
import { createNavigationContainerRef } from '@react-navigation/native';

// Untyped ref avoids a circular import with App.tsx (which owns RootStackParamList).
export const navigationRef = createNavigationContainerRef();

/** Open Cook tab ranked for expiring pantry items (optional ingredient focus). */
export function navigateToCookUseItUp(ingredient?: string): void {
  if (!navigationRef.isReady()) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above
  (navigationRef as any).navigate('MainTabs', {
    screen: 'CookTab',
    params: {
      focus: 'useItUp',
      ...(ingredient ? { ingredient } : {}),
    },
  });
}

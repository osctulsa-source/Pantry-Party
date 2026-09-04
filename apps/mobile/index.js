// gesture-handler must be the first import (Android requirement).
import 'react-native-gesture-handler';
// Reanimated 4: worklets provider must be installed before reanimated's
// native install path (WorkletsNotInstalledException = instant iOS abort).
import 'react-native-worklets';
import 'react-native-reanimated';

import { registerRootComponent } from 'expo';

import { initSentry } from './src/observability/sentry';
import { RootErrorBoundary } from './src/components/RootErrorBoundary';
import App from './App';

initSentry();

// Wrap ABOVE App so a startup error is caught and shown here instead of
// bubbling to expo-updates error-recovery (which hard-crashes on relaunch).
function Root() {
  return (
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}

registerRootComponent(Root);

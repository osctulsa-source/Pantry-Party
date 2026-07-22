// gesture-handler must be the first import (Android requirement).
import 'react-native-gesture-handler';
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

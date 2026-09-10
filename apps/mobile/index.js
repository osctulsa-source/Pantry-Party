// gesture-handler must be the first import (Android requirement).
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react-native';

import { initSentry } from './src/observability/sentry';
import { RootErrorBoundary, StartupErrorView } from './src/components/RootErrorBoundary';

initSentry();

/**
 * Load worklets / Reanimated / App behind a try/catch.
 *
 * A throw during those requires is a JS fatal inside expo-updates' 10s
 * window. Recovery then hits RelaunchProcedure.swift:94 (nil error unwrap) —
 * SIGTRAP on launch, original error discarded. Builds 36, 41, and 45 died
 * there. Catching here shows the real error instead of handing it to
 * expo-updates. Static imports would still run before this function.
 */
function loadRoot() {
  try {
    require('react-native-worklets');
    require('react-native-reanimated');
    const App = require('./App').default;
    function Root() {
      return (
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      );
    }
    return Root;
  } catch (error) {
    // Report the boot failure too. StartupErrorView shows it on-device, but
    // without this the event reaches nobody: RootErrorBoundary only catches
    // render errors, and an import-time throw never renders. (The gap #242
    // would have closed by routing boot errors through the boundary.)
    try {
      Sentry.captureException(error, { tags: { boundary: 'boot' } });
    } catch {
      // never let error reporting cause a second failure
    }
    return function BootFailure() {
      return <StartupErrorView error={error} />;
    };
  }
}

registerRootComponent(loadRoot());

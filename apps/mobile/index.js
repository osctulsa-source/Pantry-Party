// gesture-handler must be the first import (Android requirement).
import 'react-native-gesture-handler';
// Reanimated 4: worklets provider must be installed before reanimated's
// native install path (WorkletsNotInstalledException = instant iOS abort).
import 'react-native-worklets';
import 'react-native-reanimated';

import { registerRootComponent } from 'expo';

import { initSentry } from './src/observability/sentry';
import { RootErrorBoundary } from './src/components/RootErrorBoundary';

// ⚠️ DO NOT add `import App from './App'` back to this file.
//
// ES imports are hoisted, so a static import of App would evaluate its entire
// ~60-module transitive graph BEFORE any statement below runs. That is what the
// file used to do, and it made startup crashes structurally invisible:
//
//   require("./App")            <- ~60 modules evaluate here
//   initSentry()                <- Sentry initialised only afterwards
//   registerRootComponent(Root) <- boundary mounted even later
//
// So a module-scope throw anywhere in App's graph happened before Sentry
// existed and before RootErrorBoundary mounted — reported by nothing, and
// therefore an unhandled fatal that expo-updates error-recovery converts into a
// hard crash (RelaunchProcedure.swift:94 force-unwraps a nil error). That is
// the exact signature seen on TestFlight builds 36-44, and it is why adding the
// DSN and the boundary in #209 changed nothing: neither could ever fire.
//
// Verify the order after editing this file:
//   node -e "const b=require('@babel/core'),f=require('fs');
//     console.log(b.transformSync(f.readFileSync('index.js','utf8'),
//     {filename:'index.js',presets:['babel-preset-expo']}).code)"

// Must run before App's module graph is required. This also arms Sentry's
// NATIVE layer, so a native startup crash is reported on the next launch too.
initSentry();

function AppHost() {
  // require() inside render, deliberately — not a top-level import. A
  // module-scope throw in App's graph now surfaces as a render error that
  // RootErrorBoundary catches and Sentry reports, instead of an unhandled
  // fatal before either one exists. Module caching makes repeat calls free.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const App = require('./App').default;
  return <App />;
}

function Root() {
  return (
    <RootErrorBoundary>
      <AppHost />
    </RootErrorBoundary>
  );
}

registerRootComponent(Root);

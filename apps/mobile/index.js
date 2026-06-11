// gesture-handler must be the first import (Android requirement).
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import { initSentry } from './src/observability/sentry';
import App from './App';

initSentry();

registerRootComponent(App);

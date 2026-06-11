import { registerRootComponent } from 'expo';

import { initSentry } from './src/observability/sentry';
import App from './App';

initSentry();

registerRootComponent(App);

/**
 * cookActivity (iOS) — starts/updates/ends the one cook-session Live Activity.
 *
 * One activity per cook session (Apple's pattern), keyed by nothing more than
 * module state: CookModeView is a single modal, so at most one session exists.
 * Best-effort throughout: Live Activities can be disabled per-app in iOS
 * Settings, and older installed builds may predate the extension — every call
 * is try/caught and the in-app timers remain the source of truth.
 */
import { tokens } from '../../theme/tokens';
import type { CookActivitySnapshot } from './cookActivitySnapshot';
import { CookLiveActivity, type CookActivityProps } from './CookLiveActivity';
import { buildWidgetThemePair } from './widgetTheme';
import { COOK_ACTIVITY_URL } from './widgetLinks';

type Activity = ReturnType<typeof CookLiveActivity.start>;
let activity: Activity | null = null;

function toProps(snapshot: CookActivitySnapshot): CookActivityProps {
  return { ...snapshot, brandName: tokens.brandName, theme: buildWidgetThemePair() };
}

/** Push the current cook state. Starts the activity on the first timer. */
export function syncCookActivity(snapshot: CookActivitySnapshot): void {
  try {
    if (snapshot.timerCount === 0) {
      endCookActivity();
      return;
    }
    if (activity === null) {
      // A previous session's activity can outlive a crash — clear stragglers.
      for (const stale of CookLiveActivity.getInstances()) {
        void stale.end('immediate');
      }
      activity = CookLiveActivity.start(toProps(snapshot), COOK_ACTIVITY_URL);
    } else {
      void activity.update(toProps(snapshot));
    }
  } catch {
    activity = null; // Extension missing / activities disabled — non-fatal.
  }
}

/** End the session's activity (cook mode closed or finished). */
export function endCookActivity(): void {
  try {
    activity?.end('immediate');
  } catch {
    // Best-effort.
  }
  activity = null;
}

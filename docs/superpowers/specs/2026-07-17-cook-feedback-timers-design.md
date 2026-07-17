# Cook feedback layer + concurrent timers + Live Activity — design

**Date:** 2026-07-17 · **Status:** approved (user, in-conversation)

## Goal

Two related upgrades to the cook experience, plus an app-wide "juice" layer:

1. **Concurrent step timers** in cook mode — today `CookModeView` allows exactly one
   timer at a time (`CookTimer` is a single nullable value).
2. **A cook Live Activity** — the running timer(s) visible on the lock screen and in
   the Dynamic Island, Duolingo/Uber-Eats-grade polish.
3. **A sound + haptic feedback layer** — a tiny, cohesive palette of sounds and
   haptics on the app's reward moments, behind user-controllable settings.

## Key platform facts (verified in this repo)

- `expo-widgets` ~56 is **already in the shipped TestFlight build** and its widget
  extension already registers the generic `WidgetLiveActivity()` renderer
  (`apps/mobile/ios/ExpoWidgetsTarget/index.swift`). `NSSupportsLiveActivities` is
  already `true` in the shipped `Info.plist`.
- Live Activity layouts are **TypeScript**, serialized out of the JS bundle at
  runtime (`createLiveActivity(name, layout)`), so a new Live Activity is
  **OTA-shippable — no native rebuild, no `ios/` regeneration.**
- `@expo/ui/swift-ui` `Text`/`ProgressView` accept `timerInterval` (+ `countsDown`),
  so the countdown and progress render **system-side** — the Live Activity stays
  accurate with the app backgrounded, and we only push updates on discrete events.
- `expo-haptics` and `expo-notifications` are installed and already used in cook mode.
- **No audio module is installed.** Sounds require adding `expo-audio` → fingerprint
  change → next TestFlight build. Everything else ships OTA now.

## Design

### 1. Concurrent timers (OTA)

- `CookTimer` (single) → `Map<number, CookTimer>` keyed by `stepIdx` — one timer per
  step, any number of steps. Timestamp-based (`endsAt`) logic unchanged.
- Notifications: per-timer identifier `cookmode-timer-<stepIdx>` (replaces the single
  shared `cookmode-timer` id). Cancel-on-leave cancels all.
- UI: the single "return to timer" pill becomes a wrapped row of pills — one per
  timer on *other* steps, each showing its countdown and jumping to its step on tap.
  The current step's timer card is unchanged. Starting a timer on a step that
  already has one is a no-op (the card shows the running timer instead of the
  start button, as today).

### 2. Cook Live Activity (OTA)

- **One activity per cook session**, not per timer. Started when the first timer
  starts; updated on discrete events (timer start/pause/resume/reset/finish, step
  change); ended (`immediate` dismissal) when cook mode closes or finishes.
- Content state (props): recipe title, current step index/total, and the list of
  active timers (`stepIdx`, `startedAt`, `endsAt`, paused flag + frozen remaining).
- **Lock-screen banner:** brand row (name + leaf), recipe title, "Step N of M",
  hero countdown for the soonest-ending *running* timer via `Text timerInterval`
  `countsDown`, `ProgressView timerInterval` bar, and a "+N more timers" line when
  more than one runs. All-paused state shows the frozen remaining time.
- **Dynamic Island:** compact leading = timer glyph, compact trailing = system
  countdown; minimal = timer glyph; expanded = recipe + step + countdown + progress.
- Colors come through props from the token layer (same pattern as `widgetTheme.ts`);
  the layout file follows the widget rules — everything inside the function body,
  `'widget'` directive, `@expo/ui/swift-ui` primitives only.
- Deep link: `pantryparty://` URL back into the app (same scheme the widgets use).
- Registered app-side in a `cookActivity.ts` module (iOS-gated with a no-op
  `.ts`/`.ios.ts` pair, mirroring `useExpiringWidget`); `getInstances()` used on
  start to end any stale activity from a previous session.

### 3. Feedback layer: `src/feedback/feedback.ts` (OTA-safe; audio activates next build)

One module, one call per product event. Each call fires the matching haptic and (if
enabled, audible, and the native module exists) the matching sound:

| Event API        | Haptic                      | Sound            | Used at |
|------------------|-----------------------------|------------------|---------|
| `feedback.tick()`    | `selectionAsync`            | soft tick        | step check-offs, gather list, misc toggles |
| `feedback.pop()`     | `impactAsync(Light)`        | light pop        | pantry item added, timer started |
| `feedback.timerDone()` | `notificationAsync(Success)` | timer chime    | in-foreground timer zero-cross |
| `feedback.success()` | `notificationAsync(Success)` | completion chime | "I made this!" finish (with `CookSuccessBurst`) |

- **Audio session:** ambient + mix-with-others — never ducks or interrupts the
  user's podcast/music; respects the silent switch. Configured once, lazily.
- **OTA safety:** `expo-audio` is lazy-required inside a try/catch; on builds whose
  native side predates it, the module silently degrades to haptics-only.
- **Assets:** four short procedurally generated marimba-family tones (tiny .wav
  files, one timbre family so they read as one brand), committed under
  `apps/mobile/assets/sounds/`. Swapping the files later requires no code change.
- Existing direct `Haptics.*` calls in cook mode migrate to `feedback.*`; other
  screens can adopt incrementally.

### 4. Settings

- Two device-local toggles in Settings: **Sounds** and **Haptic feedback**
  (both default on), stored like the existing reminder-time preference
  (AsyncStorage-backed prefs module). `feedback.ts` reads them via a cached
  subscription so calls stay synchronous-cheap.

## Phasing / delivery

- Everything is built now on `feat/cook-feedback-timers`.
- Timers + Live Activity + haptics + settings ship **OTA immediately** after merge.
- Sounds ride the **next native build** (expo-audio added to package.json now; the
  fingerprint runtime policy automatically fences old builds from any update built
  against the new native map — publish per the TESTFLIGHT.md runbook rules).

## Error handling

- All haptic/sound/notification/activity calls are fire-and-forget with swallowed
  errors — feedback must never break cooking.
- Live Activity start can fail (user disabled Live Activities in Settings): ignore;
  in-app timers are the source of truth. The activity is presentation only.

## Testing

- Unit: multi-timer reducer helpers (soonest-timer selection, per-step notification
  ids, pill list derivation), feedback module gating (settings off ⇒ no calls,
  missing native module ⇒ no throw), activity props builder.
- The Live Activity layout function is presentation-only TS; verified on-device
  (TestFlight/dev build) since widget runtimes don't run under Jest.

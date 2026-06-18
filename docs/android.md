# Android — build, run, and the road to Google Play

The Android framework arc (June 2026). Status: **code is Android-ready;
toolchain bring-up + on-device verification is the remaining work.** Play
upload stays deliberately deferred — a Play package id is permanent at first
upload, so nothing goes to the Play Console until the brand (Larder/Crumb)
clears. The production Android package (`com.osctulsa.pantryparty`) is a
placeholder until then. Display name changes freely; ids do not.

> The app has been built and verified on iOS only so far. The first Android
> build is the first time Gradle compiles the native module set on this
> platform — that build, plus the on-device checklist below, is the real
> remaining work. Everything in the JS/TS layer was written cross-platform.

## What's already handled (audited 18 Jun 2026)

You do **not** need to add any of this — it's already in the codebase:

- `index.js` imports `react-native-gesture-handler` first (the Android rule).
- `app.config.js`: Crumb adaptive-icon background (`#C76B43`), oat splash
  (`#F6F2E9`), `expo-camera` permission, `expo-notifications` channel color
  (`#2E5D3A`), `userInterfaceStyle: 'automatic'` (system dark mode), and the
  `pantryparty` deep-link scheme.
- Notifications: the Android 8+ channel ("Expiry reminders") is created at
  mount, and the permission request (`requestPermissionsAsync`) is the Android
  13+ `POST_NOTIFICATIONS` runtime prompt. Lock-screen actions (✓ Used /
  Snooze) are registered as a category; killed-app taps are replayed on next
  launch.
- Hardware back: every overlay sheet (CookedItSheet, CookModeView) is an RN
  `<Modal onRequestClose>`, and InviteCodeModal is a native-stack modal — the
  Android back button dismisses all of them.
- `eas.json` has development / preview / production profiles (apk / apk / aab).

Known small gap (tracked, fixed in a follow-up): the notification **small
icon** isn't set, so Android shows a white square in the status bar. Cosmetic;
addressed after the first build with a monochrome asset.

## One-time machine setup (from scratch)

1. Install **Android Studio** (bundles the Android SDK). On first launch run
   the setup wizard; in **SDK Manager** install the latest stable SDK platform
   + **platform-tools**.
2. Install **JDK 17** if `java -version` doesn't already report 17.
3. Create an emulator in **Device Manager** (a Pixel-class device, latest
   stable system image), or enable **USB debugging** on a physical device.
4. Put `adb` on your PATH (it lives in Android Studio's `platform-tools`).
   Verify with `adb --version`.

## First build (custom dev client — same model as iOS)

```
cd Pantry-Party/apps/mobile
npx expo prebuild --platform android
SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:android
```

Notes:
- `app.config.js` defaults to the **development** variant (`.dev` ids) — the
  Android dev client is the twin of your iOS one; both can coexist on a device.
- This single prebuild autolinks **every** native module now in the lockfile —
  op-sqlite, PowerSync, expo-camera, react-native-svg, gesture-handler,
  expo-keep-awake, **expo-linear-gradient** (merged in #106), and Sentry. No
  separate rebuild milestone is pending for Android.
- The `SENTRY_DISABLE_AUTO_UPLOAD=true` prefix is the standing contingency from
  the iOS rebuilds (skips source-map upload when Sentry auth isn't configured).
- After prebuild, confirm the generated `android/` directory is gitignored
  before committing anything (the standard Expo ignore covers `android/` and
  `ios/` — verify, don't assume).

## Localhost: the Android difference that bites first

The Android emulator cannot see your Mac's `localhost` — the local PowerSync
(8080) and api (8090) containers are invisible until you bridge the ports. Run
after the emulator/device is connected (repeat after any adb restart):

```
adb reverse tcp:8080 tcp:8080
adb reverse tcp:8090 tcp:8090
```

No `.env` changes needed — the app keeps using localhost URLs. This also works
for a physical device over USB.

## Daily loop

```
cd Pantry-Party/apps/mobile
npx expo start
```

Press `a` for Android, `i` for iOS — both dev clients attach to the same Metro.
Re-run `adb reverse` if sync looks dead on Android.

If Metro acts up after a `node_modules` change: kill port 8081 and run
`npx expo start --clear`.

## First-run verification checklist (Android-specific)

- [ ] Gradle build completes (the native compile is the headline unknown)
- [ ] Sign in; sync end-to-end over adb reverse (sync dot settles green; psql watermark)
- [ ] Expiry notification arrives under the "Expiry reminders" channel
      (Settings → Apps → Pantry Party → Notifications shows the named channel)
- [ ] Android 13+ shows the notification permission prompt on first run
- [ ] Notification action buttons (✓ Used / Snooze 2 days) work from the shade
- [ ] Notification small icon is legible (currently a known white-square gap)
- [ ] Tab bar clears the Android navigation bar; edge-to-edge looks right; no
      content hides under the status bar on the tab screens
- [ ] Hardware back: detail screens pop; overlay sheets close; tabs → Pantry → exits
- [ ] Deep link routes:

```
adb shell am start -W -a android.intent.action.VIEW -d "pantryparty://invite/TEST-CODE"
```

- [ ] Camera opens on the Scan screen and reads a barcode (physical device;
      emulators have no real camera)
- [ ] Dark mode follows the system toggle; Bitter/Nunito fonts render
- [ ] Haptics feel acceptable (Android maps to vibration effects — tune if harsh)
- [ ] Swipe rows + LayoutAnimation row-resolve ease correctly on Fabric

Capture anything that misbehaves — those become small targeted PRs.

## EAS Build (cloud builds + signing)

One-time:

```
npm install -g eas-cli
eas login
cd Pantry-Party/apps/mobile
eas init
```

`eas init` links the project and prints an `extra.eas.projectId` snippet — add
it into `app.config.js` under `expo` when prompted (it can't write to a JS
config automatically).

Builds (profiles in `eas.json`):

```
eas build --profile development --platform android
eas build --profile preview --platform android
eas build --profile production --platform android
```

- **development**: dev-client APK (`.dev` ids) — pairs with Metro.
- **preview**: installable release APK with PRODUCTION ids — sideload-and-share
  testing on real devices without any store involvement. This is the way to put
  the app on a physical Android phone without a local Android toolchain.
- **production**: AAB for Play (signing managed by EAS; Play App Signing holds
  the final key once uploads begin).

## Google Play — when the brand locks (deferred, by decision)

1. Google Play Console developer account (one-time $25).
2. Create the app entry with the FINAL package id — this is the permanent,
   public, store-URL-visible identifier. Decide it with the brand.
3. Accept Play App Signing (Google holds the app signing key; EAS holds the
   upload key).
4. Upload the production AAB to the **Internal testing** track (up to 100
   testers by email list, instant review) — the Android twin of December's
   friends-and-family TestFlight.
5. Production-track gates (tracked in the project backlog, shared with the App
   Store gates): privacy policy URL, data-safety form, content-rating
   questionnaire, account-deletion requirement (the in-app Delete Account flow
   already exists), store-listing assets (brand-blocked by definition), and
   target-API-level compliance at submission.

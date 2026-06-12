# Android — build, run, and the road to Google Play

The Android framework arc (June 2026). Status: **framework complete, Play
upload deliberately deferred** — a Play package id is permanent at first
upload, so nothing goes to the Play Console until the brand (Larder/Crumb)
clears. Everything below makes that eventual upload a one-command event.

## One-time machine setup

1. Install Android Studio (bundles the Android SDK). In its SDK Manager,
   install the latest stable SDK + platform tools.
2. Install JDK 17 if `java -version` doesn't report 17.
3. Create an emulator in Device Manager (Pixel-class, latest stable image),
   or enable USB debugging on a physical device.
4. Ensure `adb` is on your PATH (Android Studio's platform-tools directory).

## First build (custom dev client — same model as iOS)

```
cd Pantry-Party/apps/mobile
npx expo prebuild --platform android
npx expo run:android
```

Notes:
- `app.config.js` defaults to the development variant (`.dev` ids) — the
  Android dev client is the twin of your iOS one.
- After prebuild, confirm the generated `android/` directory is gitignored
  before committing anything (`ios/` already is; the standard Expo ignore
  covers both — verify, don't assume).
- If the Sentry plugin complains during a build without auth configured,
  prefix the build with `SENTRY_DISABLE_AUTO_UPLOAD=true` (same contingency
  as iOS rebuilds).

## Localhost: the Android difference that bites first

The Android emulator cannot see your Mac's `localhost` — the local PowerSync
(8080) and api (8090) containers are invisible until you bridge the ports.
Run after the emulator/device is connected (repeat after adb restarts):

```
adb reverse tcp:8080 tcp:8080
adb reverse tcp:8090 tcp:8090
```

No `.env` changes needed — the app keeps using localhost URLs. This also
works for physical devices over USB.

## Daily loop

```
cd Pantry-Party/apps/mobile
npx expo start
```

Press `a` for Android, `i` for iOS — both dev clients attach to the same
Metro. Re-run `adb reverse` if sync looks dead on Android.

## First-run verification checklist (Android-specific)

- [ ] Sign in; sync end-to-end over adb reverse (dot settles green; psql watermark)
- [ ] Expiry notification arrives under the "Expiry reminders" channel
      (Settings → Apps → Pantry Party → Notifications shows the named channel)
- [ ] Notification action buttons (✓ Used / Snooze 2 days) work from the shade
- [ ] Tab bar clears the Android navigation bar; edge-to-edge looks right
- [ ] Hardware back: detail screens pop; tabs → Pantry → exits
- [ ] Deep link routes:

```
adb shell am start -W -a android.intent.action.VIEW -d "pantryparty://invite/TEST-CODE"
```

- [ ] Dark mode follows the system toggle; Bitter/Nunito fonts render
- [ ] Haptics feel acceptable (Android maps to vibration effects — tune later if harsh)
- [ ] Swipe rows + LayoutAnimation row-resolve ease correctly on Fabric

## EAS Build (cloud builds + signing)

One-time:

```
npm install -g eas-cli
eas login
cd Pantry-Party/apps/mobile
eas init
```

`eas init` links the project and prints an `extra.eas.projectId` snippet —
add it into `app.config.js` under `expo` when prompted (it can't write to a
JS config automatically).

Builds (profiles in `eas.json`):

```
eas build --profile development --platform android
eas build --profile preview --platform android
eas build --profile production --platform android
```

- development: dev-client APK (`.dev` ids)
- preview: installable release APK with PRODUCTION ids — sideload-and-share
  testing without any store involvement
- production: AAB for Play (signing managed by EAS; Play App Signing holds
  the final key once uploads begin)

## Google Play — when the brand locks (deferred, by decision)

1. Google Play Console developer account (one-time $25).
2. Create the app entry with the FINAL package id — this is the permanent,
   public, store-URL-visible identifier. Decide it with the brand.
3. Accept Play App Signing (Google holds the app signing key; EAS holds the
   upload key).
4. Upload the production AAB to the **Internal testing** track (up to 100
   testers by email list, instant review) — the Android twin of December's
   friends-and-family TestFlight.
5. Production-track gates (tracked in the project backlog, shared with the
   App Store gates): privacy policy URL, data-safety form, content rating
   questionnaire, account-deletion requirement, store listing assets
   (brand-blocked by definition), target API level compliance at submission.

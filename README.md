# Sheet Beater

Learn to read sheet music by playing it. A note appears on the staff, you play it on the piano keyboard at the bottom of the screen, and the app tells you straight away whether you were right. Sessions end with a results screen that shows accuracy, speed, streaks and the notes that need more work.

Runs in any modern browser (desktop or mobile, designed for landscape) and ships as native Android and iOS apps through Capacitor, ready to sign and submit to Google Play and the App Store.

## Features

**Learn**: a guided path of 8 units and 37 lessons, each introducing one idea with a short teaching card (and a preview staff with named notes) before the exercise. Lessons earn up to three stars (accuracy for the first, speed or timing precision for the rest) and each star unlocks the next lesson. Progress is saved on the device.

1. The treble clef: landmarks, lines, spaces, the whole staff, ledger lines
2. The bass clef: the same journey
3. The grand staff: both clefs, middle C from both sides, notes written on either staff
4. Reading phrases: several notes at a time, reading by step and skip
5. Sharps and flats, including accidentals that last for the bar
6. Key signatures from one to four sharps or flats, naturals that cancel them
7. Chords: intervals, triads, inversions, in keys
8. Rhythm: a metronome counts in and a cursor crosses the bar; quarter, half, whole and eighth notes, rests, 3/4 time

**Free practice**: five presets plus a fully custom mix of exercise type (single notes, phrases, chords, rhythm), staff, ledger lines, accidentals, key signatures, chord shapes, tempo, time signature, note values, session length and a per-note timer.

- Treble, bass or grand staff, rendered with [VexFlow](https://www.vexflow.com/).
- On-screen piano that scales to the screen. Key width follows the note range of the session; the keyboard height is a start-screen setting (small, medium, large). If keys would get too small to tap, the keyboard keeps a minimum key size and scrolls sideways.
- Three ways to play: tap the on-screen keys, use the computer keyboard (`A`–`K` white keys, `W E T Y U` black keys, `Z`/`X` shift octave) or plug in a MIDI keyboard (Web MIDI, Chrome and Edge).
- Built-in synth so every key you press is heard; after a mistake the correct note is played and highlighted.
- Key names on the piano: always, never, or only on keys you have missed.
- Results screen with accuracy, response times (or on-the-beat precision for rhythm), best streak, weakest notes, every miss, stars earned and a one-tap "next lesson" or "try the next level".
- Installable PWA with a landscape manifest; settings persist between visits.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173, also reachable on your LAN for phone testing
npm test           # unit tests (vitest)
npm run typecheck
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Mobile apps (App Store and Google Play)

The web build is the app. [Capacitor](https://capacitorjs.com/) wraps it in a native shell, and the `android/` and `ios/` projects are committed so they can be built, signed and uploaded like any other native app. Both are locked to landscape (Android manifest and iOS `Info.plist`), and the icons and splash screens are generated from the source images in `assets/`.

```bash
npm run cap:sync       # build the web app and copy it into android/ and ios/
npm run cap:android    # same, then open Android Studio
npm run cap:ios        # same, then open Xcode (macOS only)
npm run cap:assets     # regenerate icons and splash screens after editing assets/
```

Every time the web code changes, run `npm run cap:sync` before building the native apps.

### Before the first store upload

1. **Choose the final app id.** It is `com.sheetbeater.app` today and cannot be changed after publishing. Update it in `capacitor.config.json`, in `android/app/build.gradle` (`applicationId` and `namespace`), move `android/app/src/main/java/com/sheetbeater/app/MainActivity.java` to match the new package, and set the Bundle Identifier in Xcode (`ios/App/App.xcodeproj`).
2. **Versions.** Android: `versionCode` (must increase on every upload) and `versionName` in `android/app/build.gradle`. iOS: Marketing Version and Build in Xcode's target settings.
3. **Developer accounts.** Google Play Console (one-time registration fee) and the Apple Developer Program (yearly fee). iOS builds need a Mac with Xcode.

### Android: release build for Google Play

1. Create an upload keystore once and keep it safe; losing it means you cannot update the app:
   ```bash
   keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. Point Gradle at it without committing secrets. Create `android/keystore.properties` (git-ignored):
   ```
   storeFile=/absolute/path/to/upload-keystore.jks
   storePassword=...
   keyAlias=upload
   keyPassword=...
   ```
   and add a `signingConfigs.release` block in `android/app/build.gradle` that reads those values, or configure signing in Android Studio under Build > Generate Signed Bundle.
3. Build the bundle: `cd android && ./gradlew bundleRelease`. The `.aab` lands in `android/app/build/outputs/bundle/release/`.
4. In Play Console create the app, complete the store listing, content rating and data safety forms (this app collects no data and makes no network requests after install), then upload the bundle to an internal testing track first and promote it to production.

### iOS: release build for the App Store

1. `npm run cap:ios` opens the project in Xcode. The iOS project uses Swift Package Manager, so no CocoaPods install is needed.
2. In the App target: set the Team, Bundle Identifier, Marketing Version and Build. Signing can stay on "Automatically manage signing".
3. Product > Archive, then Distribute App > App Store Connect. Alternatively run `npx cap build ios` with signing details in `capacitor.config.json`.
4. In App Store Connect create the app record, fill in the listing, privacy details (no data collected) and screenshots in landscape, attach the build and submit for review. TestFlight lets you test the same build on devices first.

### What differs from the browser version

- Web MIDI is not available inside the native WebView, so MIDI keyboards only work in Chrome and Edge on desktop. A native MIDI plugin would be needed for mobile MIDI support.
- The service worker is only registered in the browser; the native shell ships its own copy of the web build.
- `.github/workflows/mobile.yml` builds a debug APK on Ubuntu and an unsigned simulator build on macOS for every push, so both native projects are checked continuously. Release signing is deliberately left out of CI.

## Project layout

```
src/
  music/        pitch helpers, key signatures, session config and presets, prompt generator (unit tested)
  curriculum/   lesson content and progress/stars/unlocking (unit tested)
  state/        input judging (timing, chords) and session summaries (unit tested)
  audio/        Web Audio synth
  input/        Web MIDI and computer-keyboard hooks
  components/   Staff (VexFlow) and Piano
  screens/      Start (Learn path + Free practice), Lesson intro, Practice and Results screens
android/        Capacitor Android project (open in Android Studio)
ios/            Capacitor iOS project (open in Xcode, macOS only)
assets/         source images for app icons and splash screens
```

# Sheet Beater

Learn to read sheet music by playing it. A note appears on the staff, you play it on the piano keyboard at the bottom of the screen, and the app tells you straight away whether you were right. Sessions end with a results screen that shows accuracy, speed, streaks and the notes that need more work.

Runs in any modern browser (desktop or mobile, designed for landscape) and can be wrapped as a native Android or iOS app with Capacitor.

## Features

- Treble, bass or grand staff, rendered with [VexFlow](https://www.vexflow.com/).
- Five difficulty presets plus fully custom settings: ledger lines (0–3), sharps and flats with an adjustable frequency, notes per session and an optional per-note timer.
- On-screen piano that scales to the screen. Key width follows the note range of the session; the keyboard height is a start-screen setting (small, medium, large). If keys would get too small to tap, the keyboard keeps a minimum key size and scrolls sideways.
- Three ways to play: tap the on-screen keys, use the computer keyboard (`A`–`K` white keys, `W E T Y U` black keys, `Z`/`X` shift octave) or plug in a MIDI keyboard (Web MIDI, Chrome and Edge).
- Built-in synth so every key you press is heard; after a mistake the correct note is played and highlighted.
- Key names on the piano: always, never, or only on keys you have missed.
- Results screen with accuracy, average and median response time, best streak, timeouts, weakest notes and a one-tap "try the next level" when you score 90% or more.
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

## Native app (Capacitor)

The web build is the app, so wrapping it is a few commands. The Android and iOS projects are git-ignored; generate them locally where you have Android Studio or Xcode.

```bash
npm run build
npm install --save-dev @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap add android   # and/or: npx cap add ios
npx cap sync
npx cap open android  # or: npx cap open ios
```

Lock the native app to landscape:

- **Android**: in `android/app/src/main/AndroidManifest.xml` add `android:screenOrientation="sensorLandscape"` to the main `<activity>`.
- **iOS**: in Xcode, under the target's General settings, untick Portrait in "Device Orientation" (or edit `UISupportedInterfaceOrientations` in `Info.plist`).

In the browser the app asks for a landscape orientation lock when a session starts (honoured by Android browsers in fullscreen) and shows a rotate banner in portrait.

## Project layout

```
src/
  music/        pitch helpers, difficulty presets, note generator (unit tested)
  state/        session results and summary statistics (unit tested)
  audio/        Web Audio synth
  input/        Web MIDI and computer-keyboard hooks
  components/   Staff (VexFlow) and Piano
  screens/      Start, Practice and Results screens
```

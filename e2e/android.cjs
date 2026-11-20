// Runs the smoke checks inside the installed Android app, by attaching to its web view over adb.
// Usage: node e2e/android.cjs [screenshot-dir]
const { _android: android } = require('playwright');
const { runChecks } = require('./checks.cjs');

const PKG = 'com.sheetbeater.app';
const ALLOW_BUTTONS = [
  'com.android.permissioncontroller:id/permission_allow_foreground_only_button',
  'com.android.permissioncontroller:id/permission_allow_button',
];

(async () => {
  const shots = process.argv[2];
  const [device] = await android.devices();
  if (!device) throw new Error('no Android device attached');
  console.log(`device ${device.model()} (${device.serial()}), Android ${(await device.shell('getprop ro.build.version.release')).toString().trim()}`);
  const screenshot = shots ? (name) => device.screenshot({ path: `${shots}/android-${name}.png` }) : undefined;

  await device.shell(`pm clear ${PKG}`);
  await device.shell(`am start -n ${PKG}/.MainActivity`);
  const webview = await device.webView({ pkg: PKG }, { timeout: 120000 });
  const page = await webview.page();
  await page.waitForSelector('.tab', { timeout: 60000 });
  console.log(`web view: ${await page.evaluate(() => `${navigator.userAgent} at ${location.origin}`)}`);
  const granted = async () => (await device.shell(`dumpsys package ${PKG}`)).toString().match(/RECORD_AUDIO: granted=(\w+)/)?.[1];
  console.log(`microphone permission before the app asks: granted=${await granted()}`);
  if (screenshot) await screenshot('start');

  // The app asks for the microphone only when its switch is turned on; answer the system dialog like a person would.
  const onMicPrompt = async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      for (const res of ALLOW_BUTTONS) {
        if (await device.info({ res }).then(() => true, () => false)) {
          if (screenshot) await screenshot('mic-prompt');
          await device.tap({ res });
          console.log(`system microphone dialog appeared and was allowed (${res.split('/')[1]})`);
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    console.log('no system microphone dialog appeared within 10 s');
  };

  const { failed } = await runChecks(page, { touch: false, mic: 'required', onMicPrompt, screenshot });
  console.log(`microphone permission afterwards: granted=${await granted()}`);
  const rotation = (await device.shell('dumpsys window displays')).toString().match(/mCurrentRotation=(\w+)|mRotation=(\w+)/);
  console.log(`display rotation: ${rotation ? rotation[1] ?? rotation[2] : 'unknown'}`);
  if (screenshot) await screenshot('end');
  await device.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

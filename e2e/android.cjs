// Runs the smoke checks inside the installed Android app, by attaching to its web view over adb.
// Usage: node e2e/android.cjs [screenshot-dir]
const { _android: android } = require('playwright');
const { runChecks } = require('./checks.cjs');

const PKG = 'com.sheetbeater.app';
const ALLOW_BUTTONS = ['permission_allow_foreground_only_button', 'permission_allow_button'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Finds a button of the system permission dialog on screen and returns the point to tap, using only adb. */
async function findAllowButton(device) {
  const xml = (await device.shell('uiautomator dump /sdcard/window.xml >/dev/null 2>&1; cat /sdcard/window.xml')).toString();
  for (const id of ALLOW_BUTTONS) {
    const node = xml.match(new RegExp(`<node[^>]*resource-id="[^"]*:id/${id}"[^>]*>`));
    const bounds = node?.[0].match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (bounds) {
      const [x1, y1, x2, y2] = bounds.slice(1).map(Number);
      return { id, x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
    }
  }
  return null;
}

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

  const rotation = (await device.shell('dumpsys window displays')).toString().match(/mCurrentRotation=(\w+)|mRotation=(\w+)/);
  console.log(`display rotation with the app open: ${rotation ? rotation[1] ?? rotation[2] : 'unknown'}`);

  // The app asks for the microphone only when its switch is turned on; answer the system dialog like a person would.
  const onMicPrompt = async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const button = await findAllowButton(device);
      if (button) {
        if (screenshot) await screenshot('mic-prompt');
        await device.shell(`input tap ${button.x} ${button.y}`);
        console.log(`system microphone dialog appeared and was allowed (${button.id})`);
        return;
      }
      await sleep(500);
    }
    console.log('no system microphone dialog appeared within 10 s');
  };

  const { failed } = await runChecks(page, { touch: false, mic: 'required', onMicPrompt, screenshot });
  console.log(`microphone permission afterwards: granted=${await granted()}`);
  const running = (await device.shell(`pidof ${PKG}`)).toString().trim();
  console.log(`app process at the end: ${running ? `running (pid ${running})` : 'NOT RUNNING'}`);
  const crashes = (await device.shell('logcat -d -b crash -t 80')).toString().trim();
  if (crashes) console.log(`crash log:\n${crashes}`);
  if (!running || failed) {
    const log = (await device.shell('logcat -d -t 400 -s Capacitor:* Capacitor/Console:* chromium:* cr_media:* ActivityManager:I AndroidRuntime:*')).toString();
    console.log(`recent app log:\n${log.split('\n').slice(-120).join('\n')}`);
  }
  if (screenshot) await screenshot('end');
  await device.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

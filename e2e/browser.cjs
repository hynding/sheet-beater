// Runs the smoke checks in a desktop browser engine.
// Usage: node e2e/browser.cjs <chromium|webkit|firefox> <url> [phone] [screenshot-dir]
const playwright = require('playwright');
const { runChecks } = require('./checks.cjs');

(async () => {
  const [engine = 'chromium', url = 'http://localhost:4173/', shape = 'desktop', shots] = process.argv.slice(2);
  const browser = await playwright[engine].launch();
  const phone = shape === 'phone';
  const context = await browser.newContext(
    phone
      ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: engine !== 'firefox' }
      : { viewport: { width: 1280, height: 720 } },
  );
  const page = await context.newPage();
  await page.goto(url);
  console.log(`${engine} ${browser.version()} as ${shape}: ${await page.evaluate(() => navigator.userAgent)}`);
  const screenshot = shots ? (name) => page.screenshot({ path: `${shots}/${engine}-${shape}-${name}.png` }) : undefined;
  const { failed } = await runChecks(page, { touch: phone, mic: 'optional', screenshot });
  if (screenshot) await screenshot('end');
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Smoke checks shared by every runtime: a browser engine or the Android app's web view.
// Each check throws on failure; the caller collects the results.
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi) => `${SHARP[midi % 12]}${Math.floor(midi / 12) - 1}`;

const UNITS = { treble: 5, bass: 5, grand: 4, phrases: 3, accidentals: 4, keys: 6, chords: 4, rhythm: 6 };

async function seed(page) {
  // The app saves its state once right after it mounts, so wait for that before writing over it.
  await page.waitForSelector('.tab');
  await page.waitForTimeout(500);
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.evaluate((units) => {
      const progress = {};
      for (const [unit, count] of Object.entries(units)) {
        for (let i = 1; i <= count; i++) {
          progress[`${unit}.${i}`] = { stars: 1, bestAccuracy: 0.8, bestAvgMs: 3000, attempts: 1, lastPlayedAt: Date.now() };
        }
      }
      localStorage.setItem('sheet-beater.progress.v1', JSON.stringify(progress));
      localStorage.setItem('sheet-beater.settings.v2', JSON.stringify({ sound: true }));
    }, UNITS);
    await page.reload();
    await page.waitForSelector('.tab');
    const locked = await page.locator('.lesson--locked').count();
    if (locked === 0) return;
    console.log(`seeding progress, attempt ${attempt}: ${locked} lessons still locked`);
    await page.waitForTimeout(1000);
  }
  throw new Error('could not unlock the lessons for the checks');
}

async function press(page, selector, touch) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  if (touch) await target.tap();
  else await target.click();
}

async function backToStart(page, touch) {
  if (await page.$('.results')) await press(page, 'text=Back to path', touch);
  else {
    await press(page, 'button[aria-label="Quit session"]', touch);
    await press(page, 'button[aria-label="Back to path"]', touch);
  }
  await page.waitForSelector('.path');
}

async function startLesson(page, title, touch) {
  await press(page, `.lesson[aria-label="${title}"]`, touch);
  await press(page, '.intro__footer .btn--primary', touch);
  await page.waitForSelector('.staff svg');
}

const CHECKS = [
  ['start screen', async (page) => {
    await page.waitForSelector('.tab');
    const tabs = await page.locator('.tab').allTextContents();
    if (tabs.length < 4) throw new Error(`expected 4 tabs, saw ${tabs.join(', ')}`);
    return tabs.join(' / ');
  }],

  ['notation renders with the music font', async (page, { touch }) => {
    await startLesson(page, 'The whole treble staff', touch);
    const info = await page.evaluate(async () => {
      await document.fonts.ready;
      const svg = document.querySelector('.staff svg');
      const box = svg.getBoundingClientRect();
      return {
        marks: svg.querySelectorAll('path, text').length,
        width: Math.round(box.width),
        height: Math.round(box.height),
        font: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
      };
    });
    if (info.marks < 5 || info.width < 100) throw new Error(`staff looks empty: ${JSON.stringify(info)}`);
    if (!info.font.some((f) => /bravura/i.test(f))) throw new Error(`music font not loaded: ${info.font.join(', ')}`);
    return `${info.marks} marks, ${info.width}x${info.height}, fonts ${[...new Set(info.font)].join(', ')}`;
  }],

  ['a lesson answers correctly from start to results', async (page, { touch }) => {
    let answered = 0;
    while (!(await page.$('.results'))) {
      const midi = await page.getAttribute('.staff', 'data-prompt-midi');
      if (midi === null) break;
      const count = await page.textContent('.hud__count');
      await press(page, `button[aria-label="${noteName(Number(midi))}"]`, touch);
      answered++;
      await page.waitForFunction(
        (before) => document.querySelector('.results') || document.querySelector('.hud__count')?.textContent !== before,
        count,
        { timeout: 6000 },
      );
      if (answered > 60) throw new Error('lesson never finished');
    }
    const hero = (await page.textContent('.results__hero')).replace(/\s+/g, ' ').trim();
    if (!/100/.test(hero)) throw new Error(`expected a perfect score, saw: ${hero}`);
    await backToStart(page, touch);
    return `${answered} notes, ${hero.slice(0, 60)}`;
  }],

  ['layout fits the screen', async (page, { touch }) => {
    await startLesson(page, 'The whole treble staff', touch);
    const layout = await page.evaluate(() => {
      const keys = [...document.querySelectorAll('.key--white')].map((k) => k.getBoundingClientRect().width);
      return {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        overflowY: document.documentElement.scrollHeight - window.innerHeight,
        staff: Math.round(document.querySelector('.staff').getBoundingClientRect().height),
        piano: Math.round(document.querySelector('.piano').getBoundingClientRect().height),
        key: Math.round(Math.min(...keys)),
      };
    });
    await backToStart(page, touch);
    if (layout.overflowX > 1 || layout.overflowY > 1) throw new Error(`page overflows: ${JSON.stringify(layout)}`);
    if (layout.staff < 80 || layout.piano < 80) throw new Error(`staff or piano squeezed: ${JSON.stringify(layout)}`);
    return JSON.stringify(layout);
  }],

  ['rhythm lesson runs on the audio clock', async (page, { touch }) => {
    await startLesson(page, 'Steady quarter notes', touch);
    await page.waitForSelector('.staff__playhead[style*="block"]', { timeout: 15000 });
    const before = await page.textContent('.hud__count');
    await page.waitForFunction(
      (b) => document.querySelector('.results') || document.querySelector('.hud__count')?.textContent !== b,
      before,
      { timeout: 15000 },
    );
    const after = (await page.$('.results')) ? 'results' : await page.textContent('.hud__count');
    await backToStart(page, touch);
    return `count-in finished, bar moved from ${before} to ${after}`;
  }],

  ['player piano plays, and play along follows the keys', async (page, { touch }) => {
    await press(page, '.tab >> text=Free play', touch);
    await press(page, '.piece >> text=Canon in D', touch);
    await page.waitForSelector('.score__now .staff svg');
    await press(page, 'button[aria-label="Play"]', touch);
    await page.waitForFunction(() => document.querySelectorAll('.key--correct, .key--held').length > 0, null, { timeout: 8000 });
    await page.waitForFunction(() => /Bar [2-9]/.test(document.querySelector('.freeplay__barcount')?.textContent ?? ''), null, { timeout: 20000 });
    const listened = await page.textContent('.freeplay__barcount');
    await press(page, 'button[aria-label="Stop"]', touch);
    await press(page, 'role=radio[name="Play along"]', touch);
    await press(page, 'button[aria-label="Play"]', touch);
    await page.waitForFunction(() => document.querySelectorAll('.key--answer').length > 0, null, { timeout: 5000 });
    for (let step = 0; step < 8; step++) {
      const expected = await page.evaluate(() => [...document.querySelectorAll('.key--answer')].map((k) => k.getAttribute('aria-label')));
      for (const key of expected) await press(page, `button[aria-label="${key}"]`, touch);
      await page.waitForTimeout(250);
    }
    const bar = await page.textContent('.freeplay__barcount');
    if (!/Bar ([3-9]|1\d)/.test(bar)) throw new Error(`play along did not advance: ${bar}`);
    return `listening reached "${listened.trim()}", play along reached "${bar.trim()}"`;
  }],

  ['microphone switch reports a state', async (page, { touch, mic, onMicPrompt }) => {
    await press(page, 'button[aria-label="Microphone input"]', touch);
    if (onMicPrompt) await onMicPrompt();
    await page.waitForFunction(
      () => {
        const text = document.querySelector('.mic__note')?.textContent ?? '';
        return text !== '' && text !== 'Mic starting…';
      },
      null,
      { timeout: 20000 },
    );
    const label = await page.textContent('.mic__note');
    if (mic === 'required' && !/^(Listening|Hearing)/.test(label)) throw new Error(`microphone did not start: ${label}`);
    return label;
  }],
];

async function runChecks(page, options = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seed(page);
  const results = [];
  let failed = false;
  for (const [title, check] of CHECKS) {
    try {
      const detail = await check(page, options);
      results.push({ title, ok: true, detail });
    } catch (e) {
      failed = true;
      results.push({ title, ok: false, detail: String(e.message ?? e).split('\n')[0] });
      if (options.screenshot) await options.screenshot(`fail-${results.length}`).catch(() => {});
      // Later checks start from the start screen, so get back there.
      await page.reload().catch(() => {});
      await page.waitForSelector('.tab', { timeout: 10000 }).catch(() => {});
    }
  }
  results.push({ title: 'no script errors', ok: errors.length === 0, detail: errors.join(' | ') || 'none' });
  if (errors.length) failed = true;
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.title}: ${r.detail}`);
  return { results, failed };
}

module.exports = { runChecks };

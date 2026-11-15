import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from '../music/difficulty';
import { generatePrompts, type Prompt } from '../music/generator';
import { diatonicIndex, type Letter } from '../music/notes';
import { focusWeights, masteryKey, recordAnswers, weakNotes, weakSpotConfig, weakness, type Mastery } from './mastery';
import type { Answer } from './session';

const prompt = (clef: 'treble' | 'bass', letter: Letter, octave: number, mode: Prompt['mode'] = 'single'): Prompt => ({
  id: 0,
  mode,
  clef,
  key: 'C',
  events: [{ notes: [{ letter, accidental: '', octave, midi: 60, index: diatonicIndex(letter, octave) }], duration: 'w', beat: 0, rest: false }],
});
const answer = (p: Prompt, correct: boolean, responseMs = 1000): Answer => ({ prompt: p, eventIndex: 0, played: [60], correct, responseMs, timing: 'none' });
const repeat = (m: Mastery, p: Prompt, right: number, wrong: number, ms = 1000): Mastery =>
  recordAnswers(m, [...Array.from({ length: right }, () => answer(p, true, ms)), ...Array.from({ length: wrong }, () => answer(p, false))], 1);

describe('mastery', () => {
  it('records answers per staff position and skips rhythm sessions', () => {
    let m = recordAnswers({}, [answer(prompt('treble', 'F', 4), true, 800), answer(prompt('treble', 'F', 4), false), answer(prompt('bass', 'F', 3), true, 500)], 42);
    expect(m[masteryKey('treble', { letter: 'F', octave: 4 })]).toEqual({ asked: 2, correct: 1, totalMs: 800, lastSeen: 42 });
    expect(m['bass:F3']).toMatchObject({ asked: 1, correct: 1 });
    m = recordAnswers(m, [answer(prompt('treble', 'F', 4, 'rhythm'), false)]);
    expect(m['treble:F4'].asked).toBe(2);
  });

  it('does not mutate the previous record', () => {
    const before: Mastery = { 'treble:C4': { asked: 1, correct: 1, totalMs: 500, lastSeen: 1 } };
    const after = recordAnswers(before, [answer(prompt('treble', 'C', 4), false)]);
    expect(before['treble:C4'].asked).toBe(1);
    expect(after['treble:C4'].asked).toBe(2);
  });

  it('ranks weakness from solid to always missed, with slow answers in between', () => {
    const solid = { asked: 10, correct: 10, totalMs: 10_000, lastSeen: 0 };
    const slow = { asked: 10, correct: 10, totalMs: 70_000, lastSeen: 0 };
    const shaky = { asked: 10, correct: 5, totalMs: 5_000, lastSeen: 0 };
    const lost = { asked: 10, correct: 0, totalMs: 0, lastSeen: 0 };
    expect(weakness(solid)).toBeLessThan(weakness(slow));
    expect(weakness(slow)).toBeLessThan(weakness(shaky));
    expect(weakness(shaky)).toBeLessThan(weakness(lost));
    expect(weakness(undefined)).toBe(0.5);
    expect(weakness(lost)).toBeLessThanOrEqual(1);
  });

  it('lists weak notes only after two attempts, weakest first', () => {
    let m: Mastery = {};
    m = repeat(m, prompt('treble', 'C', 5), 9, 1); // 90%: fine
    m = repeat(m, prompt('treble', 'A', 5), 1, 3); // 25%
    m = repeat(m, prompt('bass', 'E', 2), 2, 2); // 50%
    m = repeat(m, prompt('bass', 'B', 3), 0, 1); // only one attempt
    m = repeat(m, prompt('treble', 'D', 4), 4, 0, 6000); // right but slow
    const weak = weakNotes(m);
    expect(weak.map((w) => w.key)).toEqual(['treble:A5', 'bass:E2', 'treble:D4']);
    expect(weak[0]).toMatchObject({ clef: 'treble', name: 'A5', accuracy: 0.25, asked: 4 });
  });

  it('weights weak notes up and leaves solid ones near 1', () => {
    let m: Mastery = {};
    m = repeat(m, prompt('treble', 'C', 5), 20, 0);
    m = repeat(m, prompt('treble', 'A', 5), 0, 6);
    const w = focusWeights(m);
    expect(w['treble:C5']).toBeCloseTo(1, 1);
    expect(w['treble:A5']).toBeGreaterThan(4);
    expect(w['treble:G4']).toBeUndefined();
  });

  it('builds a weak-spot session from the weakest notes', () => {
    expect(weakSpotConfig({})).toBeNull();
    let m: Mastery = {};
    for (const [letter, octave] of [['A', 5], ['C', 6], ['B', 3]] as const) m = repeat(m, prompt('treble', letter, octave), 1, 3);
    m = repeat(m, prompt('bass', 'E', 2), 0, 2); // a lone bass note is left out
    const config = weakSpotConfig(m)!;
    expect(config.mode).toBe('single');
    expect(config.clef).toBe('treble');
    expect(config.notePool).toEqual([{ clef: 'treble', notes: expect.arrayContaining(['A5', 'C6', 'B3']) }]);
    const names = new Set(generatePrompts(config).map((p) => `${p.events[0].notes[0].letter}${p.events[0].notes[0].octave}`));
    expect([...names].every((n) => ['A5', 'C6', 'B3'].includes(n))).toBe(true);

    m = repeat(m, prompt('bass', 'G', 2), 0, 2);
    expect(weakSpotConfig(m)!.clef).toBe('grand');
  });
});

describe('focused generation', () => {
  it('asks heavily weighted positions more often without starving the rest', () => {
    let s = 5;
    const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
    const config = { ...BASE_CONFIG, clef: 'treble' as const, maxLedgerLines: 0, noteCount: 600, focus: { 'treble:F5': 6, 'treble:E4': 1, 'treble:G4': 1 } };
    const counts = new Map<string, number>();
    for (const p of generatePrompts(config, rng)) {
      const n = p.events[0].notes[0];
      counts.set(`${n.letter}${n.octave}`, (counts.get(`${n.letter}${n.octave}`) ?? 0) + 1);
    }
    expect(counts.get('F5')!).toBeGreaterThan(counts.get('E4')! * 3);
    expect(counts.get('E4')!).toBeGreaterThan(10);
    expect(counts.size).toBe(11); // every position of the staff still appears
  });
});

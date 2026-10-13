import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, applyPreset, type Settings } from './difficulty';
import { diatonicRangeFor, generatePrompts, keyboardRangeFor, ledgerLinesFor } from './generator';
import { diatonicIndex, spellingToMidi } from './notes';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('ledger lines', () => {
  it('counts ledger lines around the treble staff', () => {
    expect(ledgerLinesFor('treble', diatonicIndex('E', 4))).toBe(0);
    expect(ledgerLinesFor('treble', diatonicIndex('D', 4))).toBe(0);
    expect(ledgerLinesFor('treble', diatonicIndex('C', 4))).toBe(1);
    expect(ledgerLinesFor('treble', diatonicIndex('A', 3))).toBe(2);
    expect(ledgerLinesFor('treble', diatonicIndex('G', 5))).toBe(0);
    expect(ledgerLinesFor('treble', diatonicIndex('A', 5))).toBe(1);
    expect(ledgerLinesFor('treble', diatonicIndex('C', 6))).toBe(2);
  });

  it('counts ledger lines around the bass staff', () => {
    expect(ledgerLinesFor('bass', diatonicIndex('C', 4))).toBe(1);
    expect(ledgerLinesFor('bass', diatonicIndex('E', 2))).toBe(1);
  });

  it('keeps grand-staff notes on their nearest staff', () => {
    expect(diatonicRangeFor('treble', 3, 'grand')).toEqual({ min: diatonicIndex('B', 3), max: diatonicIndex('F', 5) + 7 });
    expect(diatonicRangeFor('bass', 3, 'grand')).toEqual({ min: diatonicIndex('G', 2) - 7, max: diatonicIndex('D', 4) });
    expect(diatonicRangeFor('treble', 0, 'grand')).toEqual(diatonicRangeFor('treble', 0));
    const settings: Settings = { ...DEFAULT_SETTINGS, clef: 'grand', maxLedgerLines: 3, noteCount: 300 };
    for (const p of generatePrompts(settings, seeded(5))) {
      const idx = diatonicIndex(p.spelling.letter, p.spelling.octave);
      if (p.clef === 'treble') expect(idx).toBeGreaterThanOrEqual(diatonicIndex('B', 3));
      else expect(idx).toBeLessThanOrEqual(diatonicIndex('D', 4));
    }
  });

  it('builds ranges that never exceed the ledger limit', () => {
    for (const clef of ['treble', 'bass'] as const) {
      for (let max = 0; max <= 3; max++) {
        const { min, max: top } = diatonicRangeFor(clef, max);
        expect(ledgerLinesFor(clef, min)).toBe(max);
        expect(ledgerLinesFor(clef, top)).toBe(max);
        expect(ledgerLinesFor(clef, min - 1)).toBe(max + 1);
      }
    }
  });
});

describe('generatePrompts', () => {
  it('produces the requested count with no immediate repeats', () => {
    const settings = applyPreset(DEFAULT_SETTINGS, 'expert');
    const prompts = generatePrompts(settings, seeded(7));
    expect(prompts).toHaveLength(settings.noteCount);
    for (let i = 1; i < prompts.length; i++) expect(prompts[i].midi).not.toBe(prompts[i - 1].midi);
  });

  it('respects clef and ledger limits', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, clef: 'treble', maxLedgerLines: 0, noteCount: 200 };
    for (const p of generatePrompts(settings, seeded(1))) {
      expect(p.clef).toBe('treble');
      expect(ledgerLinesFor('treble', diatonicIndex(p.spelling.letter, p.spelling.octave))).toBe(0);
      expect(p.spelling.accidental).toBe('');
      expect(spellingToMidi(p.spelling)).toBe(p.midi);
    }
  });

  it('adds accidentals when asked, never on E#/B#/Cb/Fb', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, clef: 'grand', maxLedgerLines: 1, accidentals: 'mixed', accidentalChance: 1, noteCount: 300 };
    const prompts = generatePrompts(settings, seeded(3));
    const withAcc = prompts.filter((p) => p.spelling.accidental !== '');
    expect(withAcc.length).toBeGreaterThan(prompts.length * 0.9);
    for (const p of withAcc) {
      if (p.spelling.accidental === '#') expect(['E', 'B']).not.toContain(p.spelling.letter);
      if (p.spelling.accidental === 'b') expect(['C', 'F']).not.toContain(p.spelling.letter);
    }
    expect(prompts.some((p) => p.clef === 'bass')).toBe(true);
    expect(prompts.some((p) => p.clef === 'treble')).toBe(true);
  });
});

describe('keyboardRangeFor', () => {
  it('covers the treble staff with one octave pair', () => {
    const r = keyboardRangeFor({ ...DEFAULT_SETTINGS, clef: 'treble', maxLedgerLines: 0, accidentals: 'none' });
    expect(r).toEqual({ low: 60, high: 83 }); // C4..B5 covers D4..G5
  });

  it('always starts on C and ends on B, and contains every prompt', () => {
    const settings = applyPreset(DEFAULT_SETTINGS, 'expert');
    const r = keyboardRangeFor(settings);
    expect(r.low % 12).toBe(0);
    expect(r.high % 12).toBe(11);
    for (const p of generatePrompts({ ...settings, noteCount: 500 }, seeded(9))) {
      expect(p.midi).toBeGreaterThanOrEqual(r.low);
      expect(p.midi).toBeLessThanOrEqual(r.high);
    }
  });
});

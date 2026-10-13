import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, DEFAULT_SETTINGS, applyPreset, type SessionConfig } from './difficulty';
import { DURATION_BEATS, diatonicRangeFor, eventLabel, generatePrompts, keyboardRangeFor, labelFor, ledgerLinesFor, pitchPool } from './generator';
import { diatonicIndex, spellingToMidi } from './notes';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const cfg = (patch: Partial<SessionConfig>): SessionConfig => ({ ...BASE_CONFIG, ...patch });

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

  it('keeps grand-staff notes on their nearest staff unless inner ledger lines are allowed', () => {
    expect(diatonicRangeFor('treble', 3, 'grand', 1)).toEqual({ min: diatonicIndex('B', 3), max: diatonicIndex('F', 5) + 7 });
    expect(diatonicRangeFor('bass', 3, 'grand', 1)).toEqual({ min: diatonicIndex('G', 2) - 7, max: diatonicIndex('D', 4) });
    expect(diatonicRangeFor('treble', 3, 'grand', 3)).toEqual(diatonicRangeFor('treble', 3));
    expect(diatonicRangeFor('treble', 0, 'grand', 1)).toEqual(diatonicRangeFor('treble', 0));
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

describe('pitch pools', () => {
  it('uses explicit note lists when given', () => {
    const pool = pitchPool(cfg({ notePool: [{ clef: 'treble', notes: ['E4', 'G4', 'B4'] }] }), 'treble');
    expect(pool).toEqual([diatonicIndex('E', 4), diatonicIndex('G', 4), diatonicIndex('B', 4)]);
    expect(pitchPool(cfg({ notePool: [{ clef: 'treble', notes: ['E4'] }], clef: 'bass' }), 'bass').length).toBeGreaterThan(5);
  });
});

describe('single-note prompts', () => {
  it('produces the requested count with no immediate repeats', () => {
    const settings = applyPreset(DEFAULT_SETTINGS, 'expert');
    const prompts = generatePrompts(settings, seeded(7));
    expect(prompts).toHaveLength(settings.noteCount);
    for (let i = 1; i < prompts.length; i++) {
      if (prompts[i].clef === prompts[i - 1].clef) expect(prompts[i].events[0].notes[0].index).not.toBe(prompts[i - 1].events[0].notes[0].index);
    }
  });

  it('respects clef and ledger limits', () => {
    for (const p of generatePrompts(cfg({ clef: 'treble', maxLedgerLines: 0, noteCount: 200 }), seeded(1))) {
      const n = p.events[0].notes[0];
      expect(p.clef).toBe('treble');
      expect(ledgerLinesFor('treble', n.index)).toBe(0);
      expect(n.accidental).toBe('');
      expect(spellingToMidi(n)).toBe(n.midi);
    }
  });

  it('adds accidentals when asked, never on E#/B#/Cb/Fb', () => {
    const prompts = generatePrompts(cfg({ clef: 'grand', maxLedgerLines: 1, accidentals: 'mixed', accidentalChance: 1, noteCount: 300 }), seeded(3));
    const withAcc = prompts.filter((p) => p.events[0].notes[0].accidental !== '');
    expect(withAcc.length).toBeGreaterThan(prompts.length * 0.9);
    for (const p of withAcc) {
      const n = p.events[0].notes[0];
      if (n.accidental === '#') expect(['E', 'B']).not.toContain(n.letter);
      if (n.accidental === 'b') expect(['C', 'F']).not.toContain(n.letter);
    }
    expect(prompts.some((p) => p.clef === 'bass')).toBe(true);
    expect(prompts.some((p) => p.clef === 'treble')).toBe(true);
  });

  it('applies key signatures to the pitch but not the written note', () => {
    const prompts = generatePrompts(cfg({ clef: 'treble', keys: ['G'], noteCount: 200 }), seeded(4));
    const fs = prompts.map((p) => p.events[0].notes[0]).filter((n) => n.letter === 'F');
    expect(fs.length).toBeGreaterThan(5);
    for (const f of fs) {
      expect(f.accidental).toBe('');
      expect(f.midi % 12).toBe(6); // F#
      expect(labelFor(f)).toMatch(/^F#\d$/);
    }
  });

  it('writes naturals to cancel the key signature', () => {
    const prompts = generatePrompts(cfg({ clef: 'treble', keys: ['D'], accidentals: 'mixed', accidentalChance: 1, noteCount: 200 }), seeded(5));
    const naturals = prompts.map((p) => p.events[0].notes[0]).filter((n) => n.accidental === 'n');
    expect(naturals.length).toBeGreaterThan(5);
    for (const n of naturals) {
      expect(['F', 'C']).toContain(n.letter);
      expect(n.midi).toBe(spellingToMidi({ ...n, accidental: '' }));
    }
  });
});

describe('sequence prompts', () => {
  it('makes melodic phrases of the right length', () => {
    const prompts = generatePrompts(cfg({ mode: 'sequence', clef: 'treble', maxLedgerLines: 1, sequenceLength: 4, noteCount: 50 }), seeded(8));
    for (const p of prompts) {
      expect(p.events).toHaveLength(4);
      for (let i = 1; i < 4; i++) {
        expect(Math.abs(p.events[i].notes[0].index - p.events[i - 1].notes[0].index)).toBeLessThanOrEqual(4);
        expect(p.events[i].beat).toBe(i);
      }
    }
  });

  it('carries an accidental through the rest of the bar', () => {
    const prompts = generatePrompts(cfg({ mode: 'sequence', clef: 'treble', maxLedgerLines: 1, accidentals: 'sharps', accidentalChance: 0.6, sequenceLength: 5, noteCount: 300 }), seeded(9));
    let checked = 0;
    for (const p of prompts) {
      const seen = new Map<number, string>();
      for (const e of p.events) {
        const n = e.notes[0];
        if (n.accidental !== '') seen.set(n.index, n.accidental);
        else if (seen.has(n.index)) {
          checked++;
          expect(n.midi).toBe(spellingToMidi({ ...n, accidental: seen.get(n.index) as '#' }));
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('chord prompts', () => {
  it('builds intervals, triads and inversions inside the pool', () => {
    for (const kind of ['interval', 'triad', 'inversion'] as const) {
      const config = cfg({ mode: 'chord', clef: 'grand', maxLedgerLines: 1, chordKinds: [kind], noteCount: 60 });
      for (const p of generatePrompts(config, seeded(11))) {
        const pool = new Set(pitchPool(config, p.clef));
        const idxs = p.events[0].notes.map((n) => n.index);
        expect(idxs.length).toBe(kind === 'interval' ? 2 : 3);
        for (const i of idxs) expect(pool.has(i)).toBe(true);
        if (kind === 'triad') expect([idxs[1] - idxs[0], idxs[2] - idxs[1]]).toEqual([2, 2]);
        if (kind === 'interval') expect([2, 3, 4, 5, 7]).toContain(idxs[1] - idxs[0]);
        expect(eventLabel(p.events[0]).split('+')).toHaveLength(idxs.length);
      }
    }
  });
});

describe('rhythm prompts', () => {
  it('fills every bar exactly and beams eighths in pairs', () => {
    const config = cfg({ mode: 'rhythm', clef: 'treble', maxLedgerLines: 1, timeSignature: [4, 4], durations: ['q', 'h', 'w', '8', 'qr', 'hr'], noteCount: 100 });
    for (const p of generatePrompts(config, seeded(12))) {
      const total = p.events.reduce((s, e) => s + DURATION_BEATS[e.duration], 0);
      expect(total).toBe(4);
      expect(p.events.some((e) => !e.rest)).toBe(true);
      let beat = 0;
      for (const e of p.events) {
        expect(e.beat).toBe(beat);
        beat += DURATION_BEATS[e.duration];
        if (e.rest) expect(e.notes).toHaveLength(0);
        else expect(e.notes).toHaveLength(1);
      }
      for (let i = 0; i < p.events.length; i++) {
        if (p.events[i].duration === '8') expect(p.events[i].beat % 1 === 0 ? p.events[i + 1]?.duration : p.events[i - 1]?.duration).toBe('8');
      }
    }
  });

  it('handles 3/4 with dotted halves', () => {
    const config = cfg({ mode: 'rhythm', clef: 'bass', timeSignature: [3, 4], durations: ['q', 'h', 'hd'], noteCount: 50 });
    for (const p of generatePrompts(config, seeded(13))) {
      expect(p.events.reduce((s, e) => s + DURATION_BEATS[e.duration], 0)).toBe(3);
      expect(p.timeSignature).toEqual([3, 4]);
    }
  });
});

describe('keyboardRangeFor', () => {
  it('covers the treble staff with one octave pair', () => {
    expect(keyboardRangeFor(cfg({ clef: 'treble', maxLedgerLines: 0 }))).toEqual({ low: 60, high: 83 });
  });

  it('always starts on C and ends on B, and contains every prompt', () => {
    const settings = applyPreset(DEFAULT_SETTINGS, 'expert');
    const r = keyboardRangeFor(settings);
    expect(r.low % 12).toBe(0);
    expect(r.high % 12).toBe(11);
    for (const p of generatePrompts({ ...settings, noteCount: 500 }, seeded(9))) {
      for (const n of p.events[0].notes) {
        expect(n.midi).toBeGreaterThanOrEqual(r.low);
        expect(n.midi).toBeLessThanOrEqual(r.high);
      }
    }
  });

  it('shrinks to an explicit note pool', () => {
    expect(keyboardRangeFor(cfg({ notePool: [{ clef: 'treble', notes: ['C4', 'G4', 'C5'] }] }))).toEqual({ low: 60, high: 83 });
  });
});

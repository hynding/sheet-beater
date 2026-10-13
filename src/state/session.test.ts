import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from '../music/difficulty';
import type { Prompt } from '../music/generator';
import { diatonicIndex, type Letter } from '../music/notes';
import { summarize, type Answer } from './session';

const p = (id: number, midi: number, letter: Letter, octave: number): Prompt => ({
  id,
  mode: 'single',
  clef: 'treble',
  key: 'C',
  events: [{ notes: [{ letter, accidental: '', octave, midi, index: diatonicIndex(letter, octave) }], duration: 'w', beat: 0, rest: false }],
});

describe('summarize', () => {
  it('computes accuracy, streaks and per-note stats', () => {
    const answers: Answer[] = [
      { prompt: p(0, 60, 'C', 4), eventIndex: 0, played: [60], correct: true, responseMs: 1000, timing: 'none' },
      { prompt: p(1, 62, 'D', 4), eventIndex: 0, played: [62], correct: true, responseMs: 500, timing: 'none' },
      { prompt: p(2, 64, 'E', 4), eventIndex: 0, played: [65], correct: false, responseMs: 900, timing: 'none' },
      { prompt: p(3, 60, 'C', 4), eventIndex: 0, played: [60], correct: true, responseMs: 300, timing: 'none' },
      { prompt: p(4, 64, 'E', 4), eventIndex: 0, played: [], correct: false, responseMs: 4000, timing: 'none' },
    ];
    const s = summarize({ config: BASE_CONFIG, answers, startedAt: 0, endedAt: 10_000 });
    expect(s.total).toBe(5);
    expect(s.correct).toBe(3);
    expect(s.accuracy).toBeCloseTo(0.6);
    expect(s.bestStreak).toBe(2);
    expect(s.timeouts).toBe(1);
    expect(s.avgMs).toBeCloseTo(600);
    expect(s.medianMs).toBe(500);
    expect(s.missed).toHaveLength(2);
    expect(s.byNote[0].label).toBe('E4'); // weakest first
    expect(s.byNote[0]).toMatchObject({ asked: 2, correct: 0 });
    expect(s.byNote.find((n) => n.label === 'C4')).toMatchObject({ asked: 2, correct: 2, avgMs: 650 });
    expect(s.timing.none).toBe(5);
  });

  it('handles an empty session', () => {
    const s = summarize({ config: BASE_CONFIG, answers: [], startedAt: 0, endedAt: 0 });
    expect(s.accuracy).toBe(0);
    expect(s.avgMs).toBe(0);
  });
});

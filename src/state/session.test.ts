import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../music/difficulty';
import type { Prompt } from '../music/generator';
import { summarize, type Answer } from './session';

const p = (id: number, midi: number, letter: Prompt['spelling']['letter'], octave: number): Prompt => ({
  id,
  midi,
  clef: 'treble',
  spelling: { letter, accidental: '', octave },
});

describe('summarize', () => {
  it('computes accuracy, streaks and per-note stats', () => {
    const answers: Answer[] = [
      { prompt: p(0, 60, 'C', 4), playedMidi: 60, correct: true, responseMs: 1000 },
      { prompt: p(1, 62, 'D', 4), playedMidi: 62, correct: true, responseMs: 500 },
      { prompt: p(2, 64, 'E', 4), playedMidi: 65, correct: false, responseMs: 900 },
      { prompt: p(3, 60, 'C', 4), playedMidi: 60, correct: true, responseMs: 300 },
      { prompt: p(4, 64, 'E', 4), playedMidi: null, correct: false, responseMs: 4000 },
    ];
    const s = summarize({ settings: DEFAULT_SETTINGS, answers, startedAt: 0, endedAt: 10_000 });
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
  });

  it('handles an empty session', () => {
    const s = summarize({ settings: DEFAULT_SETTINGS, answers: [], startedAt: 0, endedAt: 0 });
    expect(s.accuracy).toBe(0);
    expect(s.avgMs).toBe(0);
  });
});

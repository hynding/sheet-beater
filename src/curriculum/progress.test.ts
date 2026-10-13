import { describe, expect, it } from 'vitest';
import { generatePrompts, keyboardRangeFor, pitchPool } from '../music/generator';
import { clefsFor } from '../music/generator';
import type { Summary } from '../state/session';
import { LESSONS, UNITS, lessonById } from './lessons';
import { isUnlocked, lessonAfter, nextLesson, recordResult, starsFor, unitStars } from './progress';

const summary = (patch: Partial<Summary>): Summary => ({
  total: 10,
  correct: 10,
  accuracy: 1,
  avgMs: 1000,
  medianMs: 1000,
  bestStreak: 10,
  timeouts: 0,
  missed: [],
  byNote: [],
  timing: { perfect: 0, good: 0, early: 0, late: 0, miss: 0, none: 10 },
  durationMs: 10_000,
  ...patch,
});

describe('curriculum content', () => {
  it('has unique ids and generates valid prompts for every lesson', () => {
    const ids = new Set(LESSONS.map((l) => l.id));
    expect(ids.size).toBe(LESSONS.length);
    expect(LESSONS.length).toBeGreaterThan(30);
    for (const lesson of LESSONS) {
      for (const clef of clefsFor(lesson.config.clef)) expect(pitchPool(lesson.config, clef).length).toBeGreaterThan(0);
      const prompts = generatePrompts(lesson.config);
      expect(prompts).toHaveLength(lesson.config.noteCount);
      const range = keyboardRangeFor(lesson.config);
      for (const p of prompts) for (const e of p.events) for (const n of e.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(range.low);
        expect(n.midi).toBeLessThanOrEqual(range.high);
      }
      expect(lesson.intro.length).toBeGreaterThan(0);
    }
  });

  it('keeps the on-screen keyboard tappable on a phone for early units', () => {
    for (const unit of UNITS.slice(0, 2)) {
      for (const lesson of unit.lessons) {
        const r = keyboardRangeFor(lesson.config);
        expect(r.high - r.low).toBeLessThanOrEqual(47); // four octaves
      }
    }
  });
});

describe('stars', () => {
  const lesson = lessonById('treble.2')!;

  it('needs mastery accuracy for one star and speed for three', () => {
    expect(starsFor(lesson, summary({ accuracy: 0.7, correct: 7 }))).toBe(0);
    expect(starsFor(lesson, summary({ accuracy: 0.8, correct: 8, avgMs: 9000 }))).toBe(1);
    expect(starsFor(lesson, summary({ accuracy: 0.9, correct: 9, avgMs: lesson.targetMs * 1.5 }))).toBe(2);
    expect(starsFor(lesson, summary({ accuracy: 1, avgMs: lesson.targetMs }))).toBe(3);
    expect(starsFor(lesson, summary({ accuracy: 1, avgMs: lesson.targetMs * 3 }))).toBe(1);
  });

  it('scores rhythm lessons on timing quality', () => {
    const rhythm = lessonById('rhythm.1')!;
    expect(starsFor(rhythm, summary({ accuracy: 1, timing: { perfect: 8, good: 2, early: 0, late: 0, miss: 0, none: 0 } }))).toBe(3);
    expect(starsFor(rhythm, summary({ accuracy: 0.9, correct: 9, timing: { perfect: 2, good: 7, early: 1, late: 0, miss: 0, none: 0 } }))).toBe(2);
  });
});

describe('unlocking', () => {
  it('unlocks lessons in path order and never loses stars', () => {
    const first = LESSONS[0];
    const second = LESSONS[1];
    expect(isUnlocked(first.id, {})).toBe(true);
    expect(isUnlocked(second.id, {})).toBe(false);
    expect(nextLesson({}).id).toBe(first.id);

    let { progress, stars } = recordResult({}, first, summary({ accuracy: 1, avgMs: 500 }));
    expect(stars).toBe(3);
    expect(isUnlocked(second.id, progress)).toBe(true);
    expect(nextLesson(progress).id).toBe(second.id);
    expect(lessonAfter(first)?.id).toBe(second.id);

    ({ progress } = recordResult(progress, first, summary({ accuracy: 0.5, correct: 5 })));
    expect(progress[first.id].stars).toBe(3);
    expect(progress[first.id].attempts).toBe(2);
    expect(unitStars(UNITS[0], progress)).toEqual({ earned: 3, possible: 15 });
  });
});

import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from '../music/difficulty';
import { addSession, dailyActivity, dayKey, formatDuration, streaks, totals, type History, type SessionRecord } from './history';
import type { Answer, SessionResult } from './session';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const rec = (ts: number, patch: Partial<SessionRecord> = {}): SessionRecord => ({ at: ts, durationMs: 120_000, total: 10, correct: 8, mode: 'single', source: 'free', ...patch });

describe('history', () => {
  it('adds finished sessions and ignores empty ones', () => {
    const answer = { correct: true } as Answer;
    const result: SessionResult = { config: BASE_CONFIG, answers: [answer, { ...answer, correct: false }], startedAt: 1000, endedAt: 61_000 };
    const h = addSession([], result, 'lesson', 'treble.1');
    expect(h).toEqual([{ at: 61_000, durationMs: 60_000, total: 2, correct: 1, mode: 'single', source: 'lesson', lessonId: 'treble.1' }]);
    expect(addSession(h, { ...result, answers: [] }, 'free')).toBe(h);
  });

  it('caps the log', () => {
    let h: History = [];
    const result: SessionResult = { config: BASE_CONFIG, answers: [{ correct: true } as Answer], startedAt: 0, endedAt: 1 };
    for (let i = 0; i < 520; i++) h = addSession(h, { ...result, endedAt: i }, 'free');
    expect(h).toHaveLength(500);
    expect(h[0].at).toBe(20);
  });

  it('keys days in local time', () => {
    expect(dayKey(at(2026, 3, 5, 23))).toBe('2026-03-05');
    expect(dayKey(at(2026, 3, 6, 0))).toBe('2026-03-06');
  });

  it('counts the current streak through today or yesterday', () => {
    const now = at(2026, 11, 15, 9);
    const h = [rec(at(2026, 11, 10)), rec(at(2026, 11, 12)), rec(at(2026, 11, 13)), rec(at(2026, 11, 14)), rec(at(2026, 11, 14, 20))];
    expect(streaks(h, now)).toEqual({ current: 3, best: 3, practicedToday: false });
    expect(streaks([...h, rec(at(2026, 11, 15, 8))], now)).toEqual({ current: 4, best: 4, practicedToday: true });
    expect(streaks(h, at(2026, 11, 16))).toEqual({ current: 0, best: 3, practicedToday: false });
    expect(streaks([], now)).toEqual({ current: 0, best: 0, practicedToday: false });
  });

  it('finds the best streak across month boundaries and clock changes', () => {
    const h = [at(2026, 10, 30), at(2026, 10, 31), at(2026, 11, 1), at(2026, 11, 2), at(2026, 11, 5)].map((t) => rec(t));
    expect(streaks(h, at(2026, 11, 20)).best).toBe(4); // spans the US daylight-saving change on Nov 1
  });

  it('lays out daily activity oldest first with empty days', () => {
    const now = at(2026, 11, 15, 9);
    const days = dailyActivity([rec(at(2026, 11, 14)), rec(at(2026, 11, 14, 18), { durationMs: 60_000 }), rec(at(2026, 11, 15, 8))], 3, now);
    expect(days.map((d) => d.key)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
    expect(days.map((d) => d.minutes)).toEqual([0, 3, 2]);
    expect(days.map((d) => d.sessions)).toEqual([0, 2, 1]);
    expect(days.map((d) => d.isToday)).toEqual([false, false, true]);
    expect(days[1].answers).toBe(20);
  });

  it('totals and formats', () => {
    expect(totals([rec(1), rec(2, { total: 10, correct: 2 })])).toEqual({ sessions: 2, minutes: 4, answered: 20, correct: 10, accuracy: 0.5 });
    expect(totals([]).accuracy).toBe(0);
    expect(formatDuration(0.5)).toBe('30 s');
    expect(formatDuration(12.4)).toBe('12 min');
    expect(formatDuration(200)).toBe('3 h 20 min');
    expect(formatDuration(120)).toBe('2 h');
  });
});

import type { SessionConfig } from '../music/difficulty';
import { eventLabel, type Prompt } from '../music/generator';
import type { Timing } from './judge';

export interface Answer {
  prompt: Prompt;
  eventIndex: number;
  /** MIDI pitches played for this event (empty when it timed out or was missed). */
  played: number[];
  correct: boolean;
  responseMs: number;
  timing: Timing;
}

export interface SessionResult {
  config: SessionConfig;
  answers: Answer[];
  startedAt: number;
  endedAt: number;
}

export interface NoteStat {
  label: string;
  clef: Prompt['clef'];
  asked: number;
  correct: number;
  avgMs: number;
}

export interface Summary {
  total: number;
  correct: number;
  accuracy: number;
  avgMs: number;
  medianMs: number;
  bestStreak: number;
  timeouts: number;
  missed: Answer[];
  byNote: NoteStat[];
  timing: Record<Timing, number>;
  durationMs: number;
}

export function summarize(result: SessionResult): Summary {
  const { answers } = result;
  const total = answers.length;
  const correctAnswers = answers.filter((a) => a.correct);
  const correct = correctAnswers.length;
  const times = correctAnswers.map((a) => a.responseMs).sort((a, b) => a - b);
  const avgMs = times.length ? times.reduce((s, t) => s + t, 0) / times.length : 0;
  const medianMs = times.length ? times[Math.floor(times.length / 2)] : 0;

  let bestStreak = 0;
  let streak = 0;
  for (const a of answers) {
    streak = a.correct ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }

  const stats = new Map<string, NoteStat & { totalMs: number }>();
  for (const a of answers) {
    const label = eventLabel(a.prompt.events[a.eventIndex]);
    const key = `${a.prompt.clef}:${label}`;
    const s = stats.get(key) ?? { label, clef: a.prompt.clef, asked: 0, correct: 0, avgMs: 0, totalMs: 0 };
    s.asked += 1;
    if (a.correct) {
      s.correct += 1;
      s.totalMs += a.responseMs;
    }
    stats.set(key, s);
  }
  const byNote = [...stats.values()]
    .map(({ totalMs, ...s }) => ({ ...s, avgMs: s.correct ? totalMs / s.correct : 0 }))
    .sort((a, b) => a.correct / a.asked - b.correct / b.asked || b.avgMs - a.avgMs);

  const timing: Record<Timing, number> = { perfect: 0, good: 0, early: 0, late: 0, miss: 0, none: 0 };
  for (const a of answers) timing[a.timing] += 1;

  return {
    total,
    correct,
    accuracy: total ? correct / total : 0,
    avgMs,
    medianMs,
    bestStreak,
    timeouts: answers.filter((a) => a.played.length === 0).length,
    missed: answers.filter((a) => !a.correct),
    byNote,
    timing,
    durationMs: result.endedAt - result.startedAt,
  };
}

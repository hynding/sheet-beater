import type { Settings } from '../music/difficulty';
import type { Prompt } from '../music/generator';
import { spellingToLabel } from '../music/notes';

export interface Answer {
  prompt: Prompt;
  /** MIDI pitch played, or null when the note timed out. */
  playedMidi: number | null;
  correct: boolean;
  responseMs: number;
}

export interface SessionResult {
  settings: Settings;
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
    const label = spellingToLabel(a.prompt.spelling);
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

  return {
    total,
    correct,
    accuracy: total ? correct / total : 0,
    avgMs,
    medianMs,
    bestStreak,
    timeouts: answers.filter((a) => a.playedMidi === null).length,
    missed: answers.filter((a) => !a.correct),
    byNote,
    durationMs: result.endedAt - result.startedAt,
  };
}

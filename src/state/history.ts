import type { SessionMode } from '../music/difficulty';
import type { SessionResult } from './session';

/** One finished practice session, kept for streaks and the progress view. */
export interface SessionRecord {
  at: number;
  durationMs: number;
  total: number;
  correct: number;
  mode: SessionMode;
  source: 'lesson' | 'free' | 'weak';
  lessonId?: string;
}

export type History = SessionRecord[];

const STORAGE_KEY = 'sheet-beater.history.v1';
const MAX_RECORDS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export function loadHistory(): History {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as History) : [];
  } catch {
    return [];
  }
}

export function saveHistory(history: History): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* ignore */
  }
}

/**
 * The most practice time one answer can stand for. A session left open while
 * the phone sleeps would otherwise log hours and swamp the totals and chart.
 */
const MAX_MS_PER_ANSWER = 30_000;

export function addSession(history: History, result: SessionResult, source: SessionRecord['source'], lessonId?: string): History {
  if (result.answers.length === 0) return history;
  const elapsed = Math.max(0, result.endedAt - result.startedAt);
  const record: SessionRecord = {
    at: result.endedAt,
    durationMs: Math.min(elapsed, result.answers.length * MAX_MS_PER_ANSWER),
    total: result.answers.length,
    correct: result.answers.filter((a) => a.correct).length,
    mode: result.config.mode,
    source,
    ...(lessonId ? { lessonId } : {}),
  };
  return [...history, record].slice(-MAX_RECORDS);
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Midnight (local) at the start of the day `offset` days before `now`. */
function startOfDay(now: number, offset = 0): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

/**
 * Current streak counts back from today, or from yesterday when today has no
 * session yet, so a streak is not shown as lost before the day is over.
 */
export function streaks(history: History, now = Date.now()): { current: number; best: number; practicedToday: boolean } {
  const days = new Set(history.map((r) => dayKey(r.at)));
  const practicedToday = days.has(dayKey(now));
  let current = 0;
  for (let offset = practicedToday ? 0 : 1; days.has(dayKey(startOfDay(now, offset) + DAY_MS / 2)); offset++) current++;

  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const key of [...days].sort()) {
    const [y, m, d] = key.split('-').map(Number);
    const t = new Date(y, m - 1, d).getTime();
    // Round because a daylight-saving change makes a calendar day 23 or 25 hours long.
    run = prev !== null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best: Math.max(best, current), practicedToday };
}

export interface DayActivity {
  key: string;
  /** Short weekday name, e.g. "Mon". */
  weekday: string;
  /** e.g. "Nov 3". */
  date: string;
  minutes: number;
  sessions: number;
  answers: number;
  isToday: boolean;
}

/** One entry per day for the last `days` days, oldest first, including empty days. */
export function dailyActivity(history: History, days = 14, now = Date.now()): DayActivity[] {
  const byDay = new Map<string, { ms: number; sessions: number; answers: number }>();
  for (const r of history) {
    const k = dayKey(r.at);
    const e = byDay.get(k) ?? { ms: 0, sessions: 0, answers: 0 };
    byDay.set(k, { ms: e.ms + r.durationMs, sessions: e.sessions + 1, answers: e.answers + r.total });
  }
  const out: DayActivity[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const noon = startOfDay(now, offset) + DAY_MS / 2;
    const key = dayKey(noon);
    const e = byDay.get(key);
    const d = new Date(noon);
    out.push({
      key,
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      minutes: e ? e.ms / 60000 : 0,
      sessions: e?.sessions ?? 0,
      answers: e?.answers ?? 0,
      isToday: offset === 0,
    });
  }
  return out;
}

export function totals(history: History): { sessions: number; minutes: number; answered: number; correct: number; accuracy: number } {
  const answered = history.reduce((s, r) => s + r.total, 0);
  const correct = history.reduce((s, r) => s + r.correct, 0);
  return {
    sessions: history.length,
    minutes: history.reduce((s, r) => s + r.durationMs, 0) / 60000,
    answered,
    correct,
    accuracy: answered ? correct / answered : 0,
  };
}

/** "45 s", "12 min" or "3 h 20 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

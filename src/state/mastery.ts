import { BASE_CONFIG, type Clef, type NotePool, type SessionConfig } from '../music/difficulty';
import { parseNoteName, spellingFromDiatonic } from '../music/notes';
import type { Answer } from './session';

/**
 * Long-term memory of how well the learner reads each staff position.
 * Keys are `${clef}:${letter}${octave}` ("treble:F4"): the place on the staff,
 * whatever accidental or key signature applied when it was asked.
 */
export interface NoteMastery {
  asked: number;
  correct: number;
  /** Total response time of the correct answers, in ms. */
  totalMs: number;
  lastSeen: number;
}

export type Mastery = Record<string, NoteMastery>;

export interface WeakNote {
  key: string;
  clef: Clef;
  /** Natural note name, e.g. "F4". */
  name: string;
  accuracy: number;
  avgMs: number;
  asked: number;
  weakness: number;
}

const STORAGE_KEY = 'sheet-beater.mastery.v1';
/** Answers slower than this (on average) count as shaky even when right. */
const SLOW_MS = 4000;
const WEAK_ACCURACY = 0.8;
const MIN_ASKED = 2;
/** Weight given to notes that have never been asked: a little above a mastered note. */
export const UNSEEN_WEIGHT = 1.5;

export function masteryKey(clef: Clef, note: { letter: string; octave: number }): string {
  return `${clef}:${note.letter}${note.octave}`;
}

export function loadMastery(): Mastery {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Mastery) : {};
  } catch {
    return {};
  }
}

export function saveMastery(mastery: Mastery): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mastery));
  } catch {
    /* ignore */
  }
}

/**
 * Folds a session's answers into the mastery record. Rhythm answers are left
 * out: a late note says nothing about whether the note was read correctly.
 */
export function recordAnswers(mastery: Mastery, answers: Answer[], now = Date.now()): Mastery {
  const next: Mastery = { ...mastery };
  for (const a of answers) {
    if (a.prompt.mode === 'rhythm') continue;
    for (const n of a.prompt.events[a.eventIndex].notes) {
      const key = masteryKey(a.prompt.clef, n);
      const m = next[key] ?? { asked: 0, correct: 0, totalMs: 0, lastSeen: 0 };
      next[key] = {
        asked: m.asked + 1,
        correct: m.correct + (a.correct ? 1 : 0),
        totalMs: m.totalMs + (a.correct ? a.responseMs : 0),
        lastSeen: now,
      };
    }
  }
  return next;
}

/** 0 (solid) to 1 (always missed). Smoothed so one early slip does not dominate. */
export function weakness(m: NoteMastery | undefined): number {
  if (!m || m.asked === 0) return 0.5;
  const accuracy = (m.correct + 1) / (m.asked + 2);
  const avgMs = m.correct ? m.totalMs / m.correct : 0;
  const slow = avgMs > SLOW_MS ? Math.min(0.2, ((avgMs - SLOW_MS) / SLOW_MS) * 0.2) : 0;
  return Math.max(0, Math.min(1, 1 - accuracy + slow));
}

/** Notes the learner has seen at least twice and still misses or answers slowly, weakest first. */
export function weakNotes(mastery: Mastery): WeakNote[] {
  const out: WeakNote[] = [];
  for (const [key, m] of Object.entries(mastery)) {
    if (m.asked < MIN_ASKED) continue;
    const accuracy = m.correct / m.asked;
    const avgMs = m.correct ? m.totalMs / m.correct : 0;
    if (accuracy >= WEAK_ACCURACY && avgMs <= SLOW_MS) continue;
    const [clef, name] = key.split(':') as [Clef, string];
    out.push({ key, clef, name, accuracy, avgMs, asked: m.asked, weakness: weakness(m) });
  }
  return out.sort((a, b) => b.weakness - a.weakness || b.asked - a.asked);
}

/**
 * Relative weights for the prompt generator: a solid note keeps weight 1,
 * a note that is always missed gets 5 times the chance of being asked.
 */
export function focusWeights(mastery: Mastery): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const [key, m] of Object.entries(mastery)) {
    if (m.asked === 0) continue;
    const w = weakness(m);
    // weakness of a solid note bottoms out near 0.08; map that to ~1.
    weights[key] = Math.round((1 + Math.max(0, w - 0.1) * 4.5) * 100) / 100;
  }
  return weights;
}

/** Smallest pool a clef may have: with fewer, "never the same note twice" makes the order predictable. */
const MIN_POOL = 3;

/** Grows a short list of note names with the staff positions next to them, nearest first. */
function withNeighbors(names: string[], size: number): string[] {
  const indices = new Set(names.map((n) => parseNoteName(n).index));
  for (let step = 1; indices.size < size && step < 8; step++) {
    for (const base of names.map((n) => parseNoteName(n).index)) {
      for (const candidate of [base + step, base - step]) {
        if (indices.size < size) indices.add(candidate);
      }
    }
  }
  return [...indices]
    .sort((a, b) => a - b)
    .map((i) => {
      const s = spellingFromDiatonic(i);
      return `${s.letter}${s.octave}`;
    });
}

/**
 * A single-note session built around the weakest notes, or null when there
 * are too few. A clef with only one or two weak notes is filled out with
 * their neighbors on the staff (the notes they are most likely confused
 * with); a clef with a single weak note is left out when the other clef has
 * plenty, so the session stays on the real problem.
 */
export function weakSpotConfig(mastery: Mastery, maxNotes = 8, minNotes = 3): SessionConfig | null {
  const weak = weakNotes(mastery).slice(0, maxNotes);
  if (weak.length < minNotes) return null;
  const byClef = new Map<Clef, string[]>();
  for (const w of weak) byClef.set(w.clef, [...(byClef.get(w.clef) ?? []), w.name]);
  let entries = [...byClef.entries()];
  if (entries.some(([, notes]) => notes.length >= MIN_POOL)) entries = entries.filter(([, notes]) => notes.length > 1);
  const pools: NotePool[] = entries.map(([clef, notes]) => ({ clef, notes: withNeighbors(notes, MIN_POOL) }));
  const count = pools.reduce((s, p) => s + p.notes.length, 0);
  return {
    ...BASE_CONFIG,
    mode: 'single',
    clef: pools.length === 2 ? 'grand' : pools[0].clef,
    notePool: pools,
    noteCount: Math.max(10, Math.min(20, count * 3)),
    focus: focusWeights(mastery),
  };
}

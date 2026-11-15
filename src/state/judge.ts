/** Pure helpers for scoring input, kept separate from React so they can be unit tested. */

export type Timing = 'perfect' | 'good' | 'early' | 'late' | 'miss' | 'none';

export type TimingStrictness = 'relaxed' | 'normal' | 'strict';

export interface TimingWindows {
  perfect: number;
  good: number;
}

/** Tolerances around the expected onset, in ms, for each strictness setting. */
export const TIMING_WINDOWS: Record<TimingStrictness, TimingWindows> = {
  relaxed: { perfect: 130, good: 280 },
  normal: { perfect: 90, good: 200 },
  strict: { perfect: 60, good: 130 },
};

/** The default windows. */
export const TIMING = TIMING_WINDOWS.normal;

/** How a press relates to the beat it was meant for; `deltaMs` = pressed - expected. */
export function judgeTiming(deltaMs: number, windows: TimingWindows = TIMING): Timing {
  const d = Math.abs(deltaMs);
  if (d <= windows.perfect) return 'perfect';
  if (d <= windows.good) return 'good';
  return deltaMs < 0 ? 'early' : 'late';
}

/**
 * Works out how far a player's taps trail the scheduled clicks, from a
 * tap-along run. A tap belongs to the click whose window it falls in: from
 * `earlyMs` before that click up to the same point before the next one. The
 * window is lopsided on purpose. People rarely lead a click by much, but
 * Bluetooth audio can make them trail it by a third of a second, and a
 * symmetric "nearest click" rule would read such a tap as early for the
 * following click. Returns the median offset in ms (positive = taps arrive
 * after the scheduled time), or null when fewer than `minMatches` clicks got
 * a tap.
 */
export function medianOffset(tapsMs: number[], clicksMs: number[], minMatches = 4, earlyMs = 150): { offsetMs: number; matched: number; spreadMs: number } | null {
  if (clicksMs.length < 2) return null;
  const interval = (clicksMs[clicksMs.length - 1] - clicksMs[0]) / (clicksMs.length - 1);
  const taps = [...tapsMs].sort((a, b) => a - b);
  const deltas: number[] = [];
  for (const click of clicksMs) {
    // The first tap in the window; a second one there is a double tap.
    const tap = taps.find((t) => t >= click - earlyMs && t < click - earlyMs + interval);
    if (tap !== undefined) deltas.push(tap - click);
  }
  if (deltas.length < minMatches) return null;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const median = deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
  const q = (f: number) => deltas[Math.min(deltas.length - 1, Math.floor(f * deltas.length))];
  return { offsetMs: Math.round(median), matched: deltas.length, spreadMs: Math.round(q(0.75) - q(0.25)) };
}

/**
 * Which note a press belongs to: the nearest onset that has not been judged
 * yet. A slightly late note is then scored as late for its own beat instead
 * of early for the next one. Returns -1 when every note has been judged, or
 * when the nearest one is more than `maxDistance` away: a stray tap far from
 * any note should not use up the note that follows it.
 */
export function nearestEvent(onsets: number[], judged: boolean[], time: number, maxDistance = Infinity): number {
  let best = -1;
  for (let i = 0; i < onsets.length; i++) {
    if (judged[i]) continue;
    if (best === -1 || Math.abs(onsets[i] - time) < Math.abs(onsets[best] - time)) best = i;
  }
  return best !== -1 && Math.abs(onsets[best] - time) > maxDistance ? -1 : best;
}

/**
 * The moment to stop waiting for a note and count it as not played: once a
 * press would be nearer the next note (or the end of the bar), and never
 * before the timing window has closed. `playable[i]` is false for rests.
 */
export function missDeadline(onsets: number[], playable: boolean[], i: number, endTime: number, goodSec: number, graceSec = 0): number {
  let next = endTime;
  for (let j = i + 1; j < onsets.length; j++) {
    if (playable[j]) {
      next = onsets[j];
      break;
    }
  }
  // `graceSec` covers input that is reported late (microphone detection): a note
  // struck in time must not be written off before its report can arrive.
  return onsets[i] + Math.max(goodSec, (next - onsets[i]) / 2) + graceSec;
}

export function isOnTime(t: Timing): boolean {
  return t === 'perfect' || t === 'good';
}

/**
 * Chord entry: keys can arrive one at a time (taps) or together (MIDI).
 * A wrong key fails the chord at once; the chord is complete when every
 * target pitch has been pressed.
 */
export function chordProgress(target: number[], pressed: number[]): 'pending' | 'correct' | 'wrong' {
  const want = new Set(target);
  if (pressed.some((m) => !want.has(m))) return 'wrong';
  return target.every((m) => pressed.includes(m)) ? 'correct' : 'pending';
}

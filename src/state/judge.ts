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
 * tap-along run. Each click is matched to its nearest tap; clicks with no tap
 * within `maxDistanceMs` are skipped. Returns the median
 * offset in ms (positive = taps arrive after the scheduled time, which is the
 * normal case: the click is heard late and the touch is reported late), or
 * null when fewer than `minMatches` taps could be matched.
 */
export function medianOffset(tapsMs: number[], clicksMs: number[], maxDistanceMs = 250, minMatches = 4): { offsetMs: number; matched: number; spreadMs: number } | null {
  // Work from the clicks: each takes its nearest tap, so a stray or double tap
  // cannot push out the tap that was really meant for that click.
  const deltas: number[] = [];
  for (const click of clicksMs) {
    let best: number | null = null;
    for (const tap of tapsMs) {
      if (best === null || Math.abs(tap - click) < Math.abs(best - click)) best = tap;
    }
    if (best !== null && Math.abs(best - click) <= maxDistanceMs) deltas.push(best - click);
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
 * of early for the next one. Returns -1 when every note has been judged.
 */
export function nearestEvent(onsets: number[], judged: boolean[], time: number): number {
  let best = -1;
  for (let i = 0; i < onsets.length; i++) {
    if (judged[i]) continue;
    if (best === -1 || Math.abs(onsets[i] - time) < Math.abs(onsets[best] - time)) best = i;
  }
  return best;
}

/**
 * The moment to stop waiting for a note and count it as not played: once a
 * press would be nearer the next note (or the end of the bar), and never
 * before the timing window has closed. `playable[i]` is false for rests.
 */
export function missDeadline(onsets: number[], playable: boolean[], i: number, endTime: number, goodSec: number): number {
  let next = endTime;
  for (let j = i + 1; j < onsets.length; j++) {
    if (playable[j]) {
      next = onsets[j];
      break;
    }
  }
  return onsets[i] + Math.max(goodSec, (next - onsets[i]) / 2);
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

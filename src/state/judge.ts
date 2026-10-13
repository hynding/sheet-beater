/** Pure helpers for scoring input, kept separate from React so they can be unit tested. */

export type Timing = 'perfect' | 'good' | 'early' | 'late' | 'miss' | 'none';

/** Tolerances around the expected onset, in ms. */
export const TIMING = { perfect: 90, good: 200 } as const;

/** How a press relates to the beat it was meant for; `deltaMs` = pressed - expected. */
export function judgeTiming(deltaMs: number): Timing {
  const d = Math.abs(deltaMs);
  if (d <= TIMING.perfect) return 'perfect';
  if (d <= TIMING.good) return 'good';
  return deltaMs < 0 ? 'early' : 'late';
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

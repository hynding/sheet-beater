import type { ClefMode, Settings } from './difficulty';
import {
  diatonicIndex,
  spellingFromDiatonic,
  spellingToMidi,
  floorToC,
  ceilToB,
  type Spelling,
} from './notes';

export type Clef = 'treble' | 'bass';

export interface Prompt {
  id: number;
  midi: number;
  spelling: Spelling;
  clef: Clef;
}

/** Diatonic indices of the bottom and top lines of each staff. */
const STAFF_LINES: Record<Clef, { bottom: number; top: number }> = {
  treble: { bottom: diatonicIndex('E', 4), top: diatonicIndex('F', 5) },
  bass: { bottom: diatonicIndex('G', 2), top: diatonicIndex('A', 3) },
};

/** How many ledger lines a note at this diatonic index needs on the given clef. */
export function ledgerLinesFor(clef: Clef, index: number): number {
  const { bottom, top } = STAFF_LINES[clef];
  return Math.max(0, Math.floor((bottom - index) / 2), Math.floor((index - top) / 2));
}

/**
 * Inclusive diatonic range a clef covers with up to `maxLedgerLines` ledger lines.
 * On a grand staff the notes between the two staves are written on the nearest
 * one, so the inward side (below treble, above bass) stops at middle C's ledger line.
 */
export function diatonicRangeFor(clef: Clef, maxLedgerLines: number, mode: ClefMode = clef): { min: number; max: number } {
  const { bottom, top } = STAFF_LINES[clef];
  const outer = 2 * maxLedgerLines + 1; // ledger lines plus the space just beyond the last one
  const inner = mode === 'grand' ? 2 * Math.min(1, maxLedgerLines) + 1 : outer;
  return clef === 'treble' ? { min: bottom - inner, max: top + outer } : { min: bottom - outer, max: top + inner };
}

export function clefsFor(mode: ClefMode): Clef[] {
  return mode === 'grand' ? ['treble', 'bass'] : [mode];
}

type Rng = () => number;

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function chooseAccidental(letter: Spelling['letter'], settings: Settings, rng: Rng): Spelling['accidental'] {
  if (settings.accidentals === 'none' || rng() >= settings.accidentalChance) return '';
  // Avoid spellings that land on a white key (E#, B#, Cb, Fb): confusing for learners.
  const canSharp = letter !== 'E' && letter !== 'B';
  const canFlat = letter !== 'C' && letter !== 'F';
  let mode = settings.accidentals;
  if (mode === 'mixed') mode = rng() < 0.5 ? 'sharps' : 'flats';
  if (mode === 'sharps') return canSharp ? '#' : canFlat ? 'b' : '';
  return canFlat ? 'b' : canSharp ? '#' : '';
}

export function generatePrompt(settings: Settings, id: number, rng: Rng = Math.random, previousMidi?: number): Prompt {
  const clefs = clefsFor(settings.clef);
  for (let attempt = 0; attempt < 20; attempt++) {
    const clef = pick(clefs, rng);
    const { min, max } = diatonicRangeFor(clef, settings.maxLedgerLines, settings.clef);
    const index = min + Math.floor(rng() * (max - min + 1));
    const natural = spellingFromDiatonic(index);
    const spelling: Spelling = { ...natural, accidental: chooseAccidental(natural.letter, settings, rng) };
    const midi = spellingToMidi(spelling);
    if (midi !== previousMidi) return { id, midi, spelling, clef };
  }
  // Extremely unlikely fallback: accept a repeat.
  const clef = clefs[0];
  const { min } = diatonicRangeFor(clef, settings.maxLedgerLines, settings.clef);
  const spelling = spellingFromDiatonic(min);
  return { id, midi: spellingToMidi(spelling), spelling, clef };
}

export function generatePrompts(settings: Settings, rng: Rng = Math.random): Prompt[] {
  const prompts: Prompt[] = [];
  for (let i = 0; i < settings.noteCount; i++) {
    prompts.push(generatePrompt(settings, i, rng, prompts[i - 1]?.midi));
  }
  return prompts;
}

/**
 * Lowest and highest MIDI pitch a session can ask for, including accidentals,
 * expanded to whole octaves (C..B) so the keyboard always starts on a C.
 */
export function keyboardRangeFor(settings: Settings): { low: number; high: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const clef of clefsFor(settings.clef)) {
    const { min, max } = diatonicRangeFor(clef, settings.maxLedgerLines, settings.clef);
    low = Math.min(low, spellingToMidi(spellingFromDiatonic(min)));
    high = Math.max(high, spellingToMidi(spellingFromDiatonic(max)));
  }
  if (settings.accidentals !== 'none') {
    low -= 1;
    high += 1;
  }
  return { low: floorToC(low), high: ceilToB(high) };
}

/**
 * Pitch utilities. MIDI note numbers are the canonical pitch identity
 * (60 = middle C). A Spelling is how a pitch is written on the staff.
 */

export const NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof NOTE_LETTERS)[number];
/** Accidental written next to a note. 'n' is an explicit natural sign. */
export type Accidental = '' | '#' | 'b' | 'n';

export interface Spelling {
  letter: Letter;
  accidental: Accidental;
  octave: number;
}

const LETTER_SEMITONES: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
/** Number of white keys from C up to (but not including) each pitch class. */
const WHITE_OFFSET = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

export const MIDDLE_C = 60;

export function accidentalOffset(a: Accidental): number {
  return a === '#' ? 1 : a === 'b' ? -1 : 0;
}

export function isBlackKey(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** Note name with octave, e.g. "C#4" or "Bb3". */
export function midiToName(midi: number, prefer: 'sharp' | 'flat' = 'sharp'): string {
  const names = prefer === 'flat' ? FLAT_NAMES : SHARP_NAMES;
  return `${names[((midi % 12) + 12) % 12]}${octaveOf(midi)}`;
}

export function spellingToMidi(s: Spelling): number {
  return (s.octave + 1) * 12 + LETTER_SEMITONES[s.letter] + accidentalOffset(s.accidental);
}

/** Spell a MIDI pitch using only naturals, sharps or flats (never E#, Cb etc.). */
export function midiToSpelling(midi: number, prefer: 'sharp' | 'flat' = 'sharp'): Spelling {
  const pc = ((midi % 12) + 12) % 12;
  const octave = octaveOf(midi);
  if (!isBlackKey(midi)) {
    const letter = NOTE_LETTERS[WHITE_OFFSET[pc]];
    return { letter, accidental: '', octave };
  }
  if (prefer === 'flat') {
    const letter = NOTE_LETTERS[WHITE_OFFSET[pc] + 1];
    return { letter, accidental: 'b', octave };
  }
  const letter = NOTE_LETTERS[WHITE_OFFSET[pc]];
  return { letter, accidental: '#', octave };
}

/** Key string in VexFlow format without accidentals, e.g. "c/4". Accidentals are added as modifiers. */
export function spellingToVexKey(s: Spelling): string {
  return `${s.letter.toLowerCase()}/${s.octave}`;
}

export function spellingToLabel(s: Spelling): string {
  const acc = s.accidental === 'n' ? '♮' : s.accidental;
  return `${s.letter}${acc}${s.octave}`;
}

/**
 * Diatonic index: a number that goes up by one for each letter name,
 * regardless of accidentals. C4 = 28, D4 = 29, ... Used for staff placement.
 */
export function diatonicIndex(letter: Letter, octave: number): number {
  return octave * 7 + NOTE_LETTERS.indexOf(letter);
}

export function spellingFromDiatonic(index: number, accidental: Accidental = ''): Spelling {
  const octave = Math.floor(index / 7);
  const letter = NOTE_LETTERS[((index % 7) + 7) % 7];
  return { letter, accidental, octave };
}

/** Parse "F#4", "Bb3", "C4" into a diatonic index and accidental. */
export function parseNoteName(name: string): { index: number; accidental: Accidental } {
  const m = /^([A-G])([#bn]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note name: ${name}`);
  return { index: diatonicIndex(m[1] as Letter, Number(m[3])), accidental: m[2] as Accidental };
}

/** Index of a white key counting from MIDI 0 (C-1). Black keys map to the white key below. */
export function whiteKeyIndex(midi: number): number {
  return Math.floor(midi / 12) * 7 + WHITE_OFFSET[((midi % 12) + 12) % 12];
}

export function whiteKeysBetween(lowMidi: number, highMidi: number): number {
  let count = 0;
  for (let m = lowMidi; m <= highMidi; m++) if (!isBlackKey(m)) count++;
  return count;
}

/** Nearest C at or below the given pitch. */
export function floorToC(midi: number): number {
  return midi - (((midi % 12) + 12) % 12);
}

/** Nearest B at or above the given pitch. */
export function ceilToB(midi: number): number {
  const pc = ((midi % 12) + 12) % 12;
  return midi + (11 - pc);
}

/** Frequency in Hz for a MIDI note (A4 = 440). */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

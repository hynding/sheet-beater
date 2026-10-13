import type { Accidental, Letter } from './notes';

/** Major keys supported by the trainer, in circle-of-fifths order from the flat side. */
export const KEY_NAMES = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E'] as const;
export type KeyName = (typeof KEY_NAMES)[number];

const SHARP_ORDER: Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

export interface KeyInfo {
  name: KeyName;
  sharps: number;
  flats: number;
  relativeMinor: string;
  /** Letters altered by the key signature and how. */
  altered: Partial<Record<Letter, '#' | 'b'>>;
}

function build(name: KeyName, sharps: number, flats: number, relativeMinor: string): KeyInfo {
  const altered: Partial<Record<Letter, '#' | 'b'>> = {};
  for (let i = 0; i < sharps; i++) altered[SHARP_ORDER[i]] = '#';
  for (let i = 0; i < flats; i++) altered[FLAT_ORDER[i]] = 'b';
  return { name, sharps, flats, relativeMinor, altered };
}

export const KEYS: Record<KeyName, KeyInfo> = {
  C: build('C', 0, 0, 'A minor'),
  G: build('G', 1, 0, 'E minor'),
  D: build('D', 2, 0, 'B minor'),
  A: build('A', 3, 0, 'F# minor'),
  E: build('E', 4, 0, 'C# minor'),
  F: build('F', 0, 1, 'D minor'),
  Bb: build('Bb', 0, 2, 'G minor'),
  Eb: build('Eb', 0, 3, 'C minor'),
  Ab: build('Ab', 0, 4, 'F minor'),
};

/** The accidental a key signature applies to a letter ('' when unaltered). */
export function keyAccidental(key: KeyName, letter: Letter): Accidental {
  return KEYS[key].altered[letter] ?? '';
}

/** "G major (1 sharp)" style description. */
export function describeKey(key: KeyName): string {
  const k = KEYS[key];
  const count = k.sharps || k.flats;
  if (!count) return 'C major, no sharps or flats';
  const kind = k.sharps ? 'sharp' : 'flat';
  return `${key} major, ${count} ${kind}${count > 1 ? 's' : ''}`;
}

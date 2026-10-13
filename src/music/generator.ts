import type { ChordKind, Clef, ClefMode, Duration, SessionConfig, SessionMode } from './difficulty';
import { KEYS, keyAccidental, type KeyName } from './keys';
import {
  diatonicIndex,
  parseNoteName,
  spellingFromDiatonic,
  spellingToLabel,
  spellingToMidi,
  floorToC,
  ceilToB,
  type Accidental,
  type Spelling,
} from './notes';

export type { Clef } from './difficulty';

/** A note as written on the staff plus the pitch it stands for. */
export interface NoteSpec extends Spelling {
  midi: number;
  /** Diatonic index, kept for interval and layout logic. */
  index: number;
}

export interface PromptEvent {
  notes: NoteSpec[];
  duration: Duration;
  /** Start position within the bar, in quarter-note beats. */
  beat: number;
  rest: boolean;
}

export interface Prompt {
  id: number;
  mode: SessionMode;
  clef: Clef;
  key: KeyName;
  timeSignature?: [number, number];
  events: PromptEvent[];
}

export const DURATION_BEATS: Record<Duration, number> = { w: 4, h: 2, hd: 3, q: 1, '8': 0.5, qr: 1, hr: 2 };

export function isRest(d: Duration): boolean {
  return d.endsWith('r');
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
 * Inclusive diatonic range a clef covers. `outer` ledger lines are allowed away
 * from the middle of the grand staff; `inner` toward the other staff (single
 * staves use `outer` on both sides).
 */
export function diatonicRangeFor(clef: Clef, outer: number, mode: ClefMode = clef, inner = outer): { min: number; max: number } {
  const { bottom, top } = STAFF_LINES[clef];
  const out = 2 * outer + 1; // ledger lines plus the space just beyond the last one
  const inn = mode === 'grand' ? 2 * Math.min(inner, outer) + 1 : out;
  return clef === 'treble' ? { min: bottom - inn, max: top + out } : { min: bottom - out, max: top + inn };
}

export function clefsFor(mode: ClefMode): Clef[] {
  return mode === 'grand' ? ['treble', 'bass'] : [mode];
}

/** Diatonic indices a session may ask for on one clef. */
export function pitchPool(config: SessionConfig, clef: Clef): number[] {
  const explicit = config.notePool?.filter((p) => p.clef === clef);
  if (explicit && explicit.length) {
    return [...new Set(explicit.flatMap((p) => p.notes.map((n) => parseNoteName(n).index)))].sort((a, b) => a - b);
  }
  const { min, max } = diatonicRangeFor(clef, config.maxLedgerLines, config.clef, config.innerLedgerLines);
  const pool: number[] = [];
  for (let i = min; i <= max; i++) pool.push(i);
  return pool;
}

type Rng = () => number;

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** Pick a diatonic index, favouring small melodic moves when `melodic` is set. */
function pickIndex(pool: number[], rng: Rng, prev: number | undefined, melodic: boolean): number {
  let candidates = pool.length > 1 && prev !== undefined ? pool.filter((i) => i !== prev) : pool;
  if (melodic && prev !== undefined) {
    const near = candidates.filter((i) => Math.abs(i - prev) <= 4);
    if (near.length) candidates = near;
  }
  return pick(candidates, rng);
}

function chooseAccidental(letter: Spelling['letter'], key: KeyName, config: SessionConfig, rng: Rng): Accidental {
  if (config.accidentals === 'none' || rng() >= config.accidentalChance) return '';
  // Inside a key signature the interesting accidental is the natural that cancels it.
  if (keyAccidental(key, letter) !== '') return 'n';
  // Avoid spellings that land on a white key (E#, B#, Cb, Fb): confusing for learners.
  const canSharp = letter !== 'E' && letter !== 'B';
  const canFlat = letter !== 'C' && letter !== 'F';
  const k = KEYS[key];
  let mode = config.accidentals;
  if (mode === 'mixed') mode = k.sharps ? 'sharps' : k.flats ? 'flats' : rng() < 0.5 ? 'sharps' : 'flats';
  // In a sharp key stay with sharps (and vice versa); only C major mixes freely.
  const strict = k.sharps > 0 || k.flats > 0;
  if (mode === 'sharps') return canSharp ? '#' : !strict && canFlat ? 'b' : '';
  return canFlat ? 'b' : !strict && canSharp ? '#' : '';
}

/**
 * Builds a note from a diatonic index. `barAccidentals` carries accidentals
 * forward within a bar, as notation rules require.
 */
function makeNote(index: number, key: KeyName, written: Accidental, barAccidentals: Map<number, Accidental>): NoteSpec {
  const spelling = spellingFromDiatonic(index, written);
  const effective: Accidental = written !== '' ? written : (barAccidentals.get(index) ?? keyAccidental(key, spelling.letter));
  if (written !== '') barAccidentals.set(index, written);
  const midi = spellingToMidi({ ...spelling, accidental: effective === 'n' ? '' : effective });
  return { ...spelling, midi, index };
}

const INTERVAL_STEPS = [2, 4, 7, 3, 5]; // 3rd, 5th, octave, 4th, 6th (diatonic steps)

function buildChord(pool: number[], kind: ChordKind, rng: Rng): number[] {
  const set = new Set(pool);
  const fits = (idxs: number[]) => idxs.every((i) => set.has(i));
  for (let attempt = 0; attempt < 40; attempt++) {
    const root = pick(pool, rng);
    if (kind === 'interval') {
      const steps = pick(INTERVAL_STEPS, rng);
      if (fits([root, root + steps])) return [root, root + steps];
    } else if (kind === 'triad') {
      if (fits([root, root + 2, root + 4])) return [root, root + 2, root + 4];
    } else {
      const shape = rng() < 0.5 ? [root + 2, root + 4, root + 7] : [root + 4, root + 7, root + 9];
      if (fits(shape)) return shape;
    }
  }
  // Pool too small for the requested shape: fall back to the simplest interval, then a single note.
  for (const root of pool) if (set.has(root + 2)) return [root, root + 2];
  return [pick(pool, rng)];
}

function fillBar(config: SessionConfig, rng: Rng): Duration[] {
  const [beats, unit] = config.timeSignature;
  const total = (beats * 4) / unit;
  const out: Duration[] = [];
  let used = 0;
  while (used < total) {
    const remaining = total - used;
    const lastWasRest = out.length > 0 && isRest(out[out.length - 1]);
    const options = config.durations.filter((d) => {
      if (DURATION_BEATS[d] > remaining) return false;
      if (d === '8') return remaining >= 1; // eighths come in beamed pairs
      if (isRest(d) && lastWasRest) return false;
      return true;
    });
    if (!options.length) {
      out.push('q');
      used += 1;
      continue;
    }
    const d = pick(options, rng);
    if (d === '8') {
      out.push('8', '8');
      used += 1;
    } else {
      out.push(d);
      used += DURATION_BEATS[d];
    }
  }
  if (out.every(isRest)) out[0] = out[0] === 'hr' ? 'h' : 'q';
  return out;
}

export function generatePrompt(config: SessionConfig, id: number, rng: Rng = Math.random, previous?: Prompt): Prompt {
  const clef = pick(clefsFor(config.clef), rng);
  const key = config.keys.length ? pick(config.keys, rng) : 'C';
  const pool = pitchPool(config, clef);
  const lastEvent = previous?.clef === clef ? previous.events.filter((e) => !e.rest).at(-1) : undefined;
  let prev = lastEvent?.notes[0]?.index;
  const bar = new Map<number, Accidental>();
  const events: PromptEvent[] = [];

  const note = (index: number, melodicNext = true) => {
    const n = makeNote(index, key, chooseAccidental(spellingFromDiatonic(index).letter, key, config, rng), bar);
    if (melodicNext) prev = index;
    return n;
  };

  switch (config.mode) {
    case 'single': {
      events.push({ notes: [note(pickIndex(pool, rng, prev, false))], duration: 'w', beat: 0, rest: false });
      break;
    }
    case 'sequence': {
      for (let i = 0; i < config.sequenceLength; i++) {
        events.push({ notes: [note(pickIndex(pool, rng, prev, true))], duration: 'q', beat: i, rest: false });
      }
      break;
    }
    case 'chord': {
      const kind = config.chordKinds.length ? pick(config.chordKinds, rng) : 'triad';
      const idxs = buildChord(pool, kind, rng);
      events.push({ notes: idxs.map((i) => makeNote(i, key, '', bar)), duration: 'w', beat: 0, rest: false });
      break;
    }
    case 'rhythm': {
      let beat = 0;
      for (const d of fillBar(config, rng)) {
        const rest = isRest(d);
        events.push({ notes: rest ? [] : [note(pickIndex(pool, rng, prev, true))], duration: d, beat, rest });
        beat += DURATION_BEATS[d];
      }
      break;
    }
  }

  return {
    id,
    mode: config.mode,
    clef,
    key,
    timeSignature: config.mode === 'rhythm' ? config.timeSignature : undefined,
    events,
  };
}

export function generatePrompts(config: SessionConfig, rng: Rng = Math.random): Prompt[] {
  const prompts: Prompt[] = [];
  for (let i = 0; i < config.noteCount; i++) prompts.push(generatePrompt(config, i, rng, prompts[i - 1]));
  return prompts;
}

/** Human label for an event: "E4", "F#4", or "C4+E4+G4" for chords. Rests are "rest". */
export function eventLabel(event: PromptEvent): string {
  if (event.rest) return 'rest';
  return event.notes.map(labelFor).join('+');
}

/** The pitch name the player must find, e.g. "F#4" for an F in G major. */
export function labelFor(n: NoteSpec): string {
  const natural = spellingToMidi({ letter: n.letter, accidental: '', octave: n.octave });
  const diff = n.midi - natural;
  return spellingToLabel({ letter: n.letter, accidental: diff === 1 ? '#' : diff === -1 ? 'b' : '', octave: n.octave });
}

/**
 * Lowest and highest MIDI pitch a session can ask for, expanded to whole
 * octaves (C..B) so the keyboard always starts on a C.
 */
export function keyboardRangeFor(config: SessionConfig): { low: number; high: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const clef of clefsFor(config.clef)) {
    const pool = pitchPool(config, clef);
    if (!pool.length) continue;
    low = Math.min(low, spellingToMidi(spellingFromDiatonic(pool[0])));
    high = Math.max(high, spellingToMidi(spellingFromDiatonic(pool[pool.length - 1])));
  }
  if (!Number.isFinite(low)) return { low: 60, high: 71 };
  const altered = config.accidentals !== 'none' || config.keys.some((k) => k !== 'C');
  if (altered) {
    low -= 1;
    high += 1;
  }
  return { low: floorToC(low), high: ceilToB(high) };
}

/** A prompt built from explicit note names, used for lesson previews. */
export function promptFromNames(clef: Clef, names: string[], key: KeyName = 'C'): Prompt {
  const bar = new Map<number, Accidental>();
  return {
    id: -1,
    mode: 'sequence',
    clef,
    key,
    events: names.map((name, i) => {
      const { index, accidental } = parseNoteName(name);
      return { notes: [makeNote(index, key, accidental, bar)], duration: 'q', beat: i, rest: false };
    }),
  };
}

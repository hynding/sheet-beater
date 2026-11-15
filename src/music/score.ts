import type { Clef, Duration } from './difficulty';
import { DURATION_BEATS, isRest, type NoteSpec, type Prompt, type PromptEvent } from './generator';
import { keyAccidental, type KeyName } from './keys';
import { parseNoteName, spellingFromDiatonic, spellingToMidi, type Accidental } from './notes';

/**
 * A compact text notation for short scores:
 *   "C4/q [E4,G4]/8 r/8 | D4/h"  -> bars separated by '|', events by spaces,
 *   a note name or bracketed chord (or r for a rest) followed by /duration.
 * Note names give the sounding pitch (F#4, Bb3, B#3); the written accidental
 * is worked out from the key signature and what came earlier in the bar.
 */
export interface PieceDefinition {
  id: string;
  title: string;
  composer: string;
  description: string;
  key: KeyName;
  /** How to name the key when the signature's relative minor is meant, e.g. "C sharp minor". */
  keyLabel?: string;
  timeSignature: [number, number];
  /** Quarter notes per minute. */
  tempo: number;
  treble: string;
  bass: string;
}

export interface Bar {
  treble: PromptEvent[];
  bass: PromptEvent[];
}

export interface Piece extends Omit<PieceDefinition, 'treble' | 'bass'> {
  bars: Bar[];
  /** Length of one bar in quarter-note beats. */
  barBeats: number;
}

/** Everything that starts at one moment, across both hands. */
export interface Step {
  index: number;
  bar: number;
  /** Quarter-note beats from the start of the bar. */
  beatInBar: number;
  /** Quarter-note beats from the start of the piece. */
  beat: number;
  treble: NoteSpec[];
  bass: NoteSpec[];
  /** Each sounding note with its own length in beats. */
  notes: Array<{ midi: number; beats: number; hand: Clef }>;
  /** Beats until the next step (or the end of the piece). */
  gap: number;
}

export function barBeatsOf(timeSignature: [number, number]): number {
  return (timeSignature[0] * 4) / timeSignature[1];
}

function parseVoice(text: string, key: KeyName): PromptEvent[][] {
  return text
    .split('|')
    .map((bar) => bar.trim())
    .filter((bar) => bar.length > 0)
    .map((bar) => {
      const state = new Map<number, Accidental>();
      let beat = 0;
      return bar.split(/\s+/).map((token) => {
        const m = /^(\[[^\]]+\]|[A-Ga-g][#bn]?-?\d|r)\/(\w+)$/.exec(token);
        if (!m) throw new Error(`Bad token "${token}" in bar "${bar}"`);
        const duration = m[2] as Duration;
        if (!(duration in DURATION_BEATS)) throw new Error(`Bad duration "${duration}" in "${token}"`);
        const rest = m[1] === 'r';
        if (rest && !isRest(duration)) throw new Error(`Rest "${token}" needs an r duration`);
        const names = rest ? [] : m[1].startsWith('[') ? m[1].slice(1, -1).split(',') : [m[1]];
        const notes = names.map((name) => noteFromName(name.trim(), key, state));
        const event: PromptEvent = { notes, duration, beat, rest };
        beat += DURATION_BEATS[duration];
        return event;
      });
    });
}

function noteFromName(name: string, key: KeyName, state: Map<number, Accidental>): NoteSpec {
  const { index, accidental } = parseNoteName(name.replace(/^([a-g])/, (c) => c.toUpperCase()));
  const spelling = spellingFromDiatonic(index);
  const sounding: Accidental = accidental === 'n' ? '' : accidental;
  const inForce = state.get(index) ?? keyAccidental(key, spelling.letter);
  const written: Accidental = sounding === inForce ? '' : sounding === '' ? 'n' : sounding;
  state.set(index, sounding);
  return { ...spelling, accidental: written, midi: spellingToMidi({ ...spelling, accidental: sounding }), index };
}

export function parsePiece(def: PieceDefinition): Piece {
  const treble = parseVoice(def.treble, def.key);
  const bass = parseVoice(def.bass, def.key);
  if (treble.length !== bass.length) throw new Error(`${def.title}: treble has ${treble.length} bars, bass has ${bass.length}`);
  const barBeats = barBeatsOf(def.timeSignature);
  const bars = treble.map((t, i) => {
    for (const [hand, events] of [['treble', t], ['bass', bass[i]]] as const) {
      const total = events.reduce((s, e) => s + DURATION_BEATS[e.duration], 0);
      if (Math.abs(total - barBeats) > 1e-9) throw new Error(`${def.title}: ${hand} bar ${i + 1} has ${total} beats, expected ${barBeats}`);
    }
    return { treble: t, bass: bass[i] };
  });
  const { treble: _t, bass: _b, ...rest } = def;
  void _t;
  void _b;
  return { ...rest, bars, barBeats };
}

/** The bar as a two-part prompt the Staff component can draw. */
export function barPrompt(piece: Piece, bar: number): Prompt {
  const b = piece.bars[bar];
  return {
    id: bar,
    mode: 'rhythm',
    clef: 'treble',
    key: piece.key,
    timeSignature: piece.timeSignature,
    events: b.treble,
    secondary: { clef: 'bass', events: b.bass },
  };
}

/** Flattens the piece into steps ordered by onset, merging both hands. */
export function buildTimeline(piece: Piece): Step[] {
  const byBeat = new Map<number, Step>();
  piece.bars.forEach((bar, barIndex) => {
    for (const hand of ['treble', 'bass'] as const) {
      for (const e of bar[hand]) {
        if (e.rest) continue;
        const beat = barIndex * piece.barBeats + e.beat;
        const key = Math.round(beat * 1000);
        const step = byBeat.get(key) ?? { index: 0, bar: barIndex, beatInBar: e.beat, beat, treble: [], bass: [], notes: [], gap: 0 };
        step[hand].push(...e.notes);
        step.notes.push(...e.notes.map((n) => ({ midi: n.midi, beats: DURATION_BEATS[e.duration], hand })));
        byBeat.set(key, step);
      }
    }
  });
  const steps = [...byBeat.values()].sort((a, b) => a.beat - b.beat);
  const total = piece.bars.length * piece.barBeats;
  steps.forEach((s, i) => {
    s.index = i;
    s.gap = (steps[i + 1]?.beat ?? total) - s.beat;
  });
  return steps;
}

export function totalBeats(piece: Piece): number {
  return piece.bars.length * piece.barBeats;
}

/** Lowest and highest pitch in the piece. */
export function pieceRange(piece: Piece): { low: number; high: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const bar of piece.bars) for (const e of [...bar.treble, ...bar.bass]) for (const n of e.notes) {
    low = Math.min(low, n.midi);
    high = Math.max(high, n.midi);
  }
  return { low, high };
}

export type PlayerHands = 'right' | 'left' | 'both';

/**
 * Splits a step for play-along: the pitches the player must supply, and the
 * hands the app plays itself once they have.
 */
export function splitStep(step: Step, hands: PlayerHands): { want: number[]; auto: Clef[] } {
  const treble = step.treble.map((n) => n.midi);
  const bass = step.bass.map((n) => n.midi);
  if (hands === 'both') return { want: [...new Set([...bass, ...treble])], auto: [] };
  return hands === 'right' ? { want: treble, auto: ['bass'] } : { want: bass, auto: ['treble'] };
}

/** Index of the first step at or after a beat position. */
export function stepIndexAt(steps: Step[], beat: number): number {
  let i = 0;
  while (i < steps.length && steps[i].beat < beat - 1e-9) i++;
  return i;
}

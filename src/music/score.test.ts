import { describe, expect, it } from 'vitest';
import { DURATION_BEATS } from './generator';
import { PIECES } from './pieces';
import { barPrompt, buildTimeline, parsePiece, pieceRange, splitStep, stepIndexAt, totalBeats, type PieceDefinition } from './score';

const def = (patch: Partial<PieceDefinition>): PieceDefinition => ({
  id: 't',
  title: 'Test',
  composer: 'x',
  description: '',
  key: 'C',
  timeSignature: [4, 4],
  tempo: 60,
  treble: 'C4/w',
  bass: 'r/wr',
  ...patch,
});

describe('score notation', () => {
  it('parses notes, chords, rests and bars', () => {
    const piece = parsePiece(def({ treble: 'C4/q [E4,G4]/8 r/8r D4/h | F#4/w', bass: 'C3/w | r/wr' }));
    expect(piece.bars).toHaveLength(2);
    const b0 = piece.bars[0].treble;
    expect(b0.map((e) => e.beat)).toEqual([0, 1, 1.5, 2]);
    expect(b0[1].notes.map((n) => n.midi)).toEqual([64, 67]);
    expect(b0[2].rest).toBe(true);
    expect(piece.bars[1].treble[0]).toMatchObject({ notes: [{ letter: 'F', accidental: '#', midi: 66 }] });
  });

  it('writes accidentals relative to the key and carries them through the bar', () => {
    const piece = parsePiece(def({ key: 'G', treble: 'F#4/q F#4/q F4/q F4/q | F#4/w', bass: 'r/wr | r/wr' }));
    const acc = piece.bars[0].treble.map((e) => e.notes[0].accidental);
    expect(acc).toEqual(['', '', 'n', '']); // F# is in the key; the natural cancels it and holds
    expect(piece.bars[0].treble.map((e) => e.notes[0].midi)).toEqual([66, 66, 65, 65]);
    expect(piece.bars[1].treble[0].notes[0].accidental).toBe(''); // bar line resets
  });

  it('rejects bars of the wrong length and mismatched hands', () => {
    expect(() => parsePiece(def({ treble: 'C4/h' }))).toThrow(/expected 4/);
    expect(() => parsePiece(def({ treble: 'C4/w | C4/w' }))).toThrow(/bars/);
    expect(() => parsePiece(def({ treble: 'C4/x' }))).toThrow(/Bad/);
  });

  it('builds a merged timeline with gaps', () => {
    const piece = parsePiece(def({ treble: 'C4/h D4/h', bass: 'C3/q r/qr G3/h' }));
    const steps = buildTimeline(piece);
    expect(steps.map((s) => s.beat)).toEqual([0, 2]);
    expect(steps[0].treble.map((n) => n.midi)).toEqual([60]);
    expect(steps[0].bass.map((n) => n.midi)).toEqual([48]);
    expect(steps[0].notes.find((n) => n.midi === 48)?.beats).toBe(1);
    expect(steps[1].bass.map((n) => n.midi)).toEqual([55]);
    expect(steps.map((s) => s.gap)).toEqual([2, 2]);
    expect(totalBeats(piece)).toBe(4);
  });
});

describe('built-in pieces', () => {
  it('parse, fill every bar in both hands and expose a two-part prompt', () => {
    expect(PIECES.map((p) => p.id)).toEqual(['entertainer', 'moonlight', 'canon']);
    for (const piece of PIECES) {
      expect(piece.bars.length).toBeGreaterThanOrEqual(8);
      for (const bar of piece.bars) {
        for (const hand of [bar.treble, bar.bass]) {
          expect(hand.reduce((s, e) => s + DURATION_BEATS[e.duration], 0)).toBeCloseTo(piece.barBeats);
        }
      }
      const prompt = barPrompt(piece, 0);
      expect(prompt.secondary?.clef).toBe('bass');
      const range = pieceRange(piece);
      expect(range.high - range.low).toBeLessThan(60);
      const steps = buildTimeline(piece);
      expect(steps.length).toBeGreaterThan(10);
      expect(steps.reduce((s, st) => s + st.gap, 0)).toBeCloseTo(totalBeats(piece) - steps[0].beat);
    }
  });

  it('spells the Moonlight Sonata in C sharp minor correctly', () => {
    const moonlight = PIECES[1];
    const first = moonlight.bars[0].treble[0].notes[0];
    expect(first.letter).toBe('G');
    expect(first.accidental).toBe(''); // G# comes from the key signature
    expect(first.midi).toBe(56);
    const bSharp = moonlight.bars[3].treble[1].notes[0];
    expect(bSharp).toMatchObject({ letter: 'B', accidental: '#', midi: 60 });
    const dNatural = moonlight.bars[2].treble[7].notes[0];
    expect(dNatural).toMatchObject({ letter: 'D', accidental: 'n', midi: 62 });
  });
});

describe('play-along helpers', () => {
  const piece = parsePiece(def({ treble: 'C4/h [D4,F4]/h | E4/w', bass: 'C3/q G3/q C3/h | r/wr' }));
  const steps = buildTimeline(piece);

  it('splits a step by the hand the player takes', () => {
    expect(steps.map((s) => s.beat)).toEqual([0, 1, 2, 4]);
    expect(splitStep(steps[0], 'right')).toEqual({ want: [60], auto: ['bass'] });
    expect(splitStep(steps[0], 'left')).toEqual({ want: [48], auto: ['treble'] });
    expect(splitStep(steps[0], 'both')).toEqual({ want: [48, 60], auto: [] });
    expect(splitStep(steps[1], 'right').want).toEqual([]); // left-hand-only step plays itself
    expect(splitStep(steps[2], 'right').want).toEqual([62, 65]);
    expect(splitStep(steps[3], 'left').want).toEqual([]);
  });

  it('finds the step to resume from after a seek', () => {
    expect(stepIndexAt(steps, 0)).toBe(0);
    expect(stepIndexAt(steps, 0.5)).toBe(1);
    expect(stepIndexAt(steps, 4)).toBe(3); // start of bar 2
    expect(stepIndexAt(steps, 99)).toBe(4);
  });
});

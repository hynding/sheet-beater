import { describe, expect, it } from 'vitest';
import {
  midiToSpelling,
  spellingToMidi,
  spellingToVexKey,
  spellingToLabel,
  midiToName,
  diatonicIndex,
  spellingFromDiatonic,
  parseNoteName,
  whiteKeysBetween,
  floorToC,
  ceilToB,
  isBlackKey,
} from './notes';

describe('notes', () => {
  it('round-trips spellings through MIDI', () => {
    for (let midi = 21; midi <= 108; midi++) {
      expect(spellingToMidi(midiToSpelling(midi, 'sharp'))).toBe(midi);
      expect(spellingToMidi(midiToSpelling(midi, 'flat'))).toBe(midi);
    }
  });

  it('spells middle C and its neighbours', () => {
    expect(midiToSpelling(60)).toEqual({ letter: 'C', accidental: '', octave: 4 });
    expect(midiToSpelling(61)).toEqual({ letter: 'C', accidental: '#', octave: 4 });
    expect(midiToSpelling(61, 'flat')).toEqual({ letter: 'D', accidental: 'b', octave: 4 });
    expect(midiToSpelling(59)).toEqual({ letter: 'B', accidental: '', octave: 3 });
  });

  it('formats VexFlow keys and names', () => {
    expect(spellingToVexKey({ letter: 'F', accidental: '#', octave: 5 })).toBe('f/5');
    expect(spellingToLabel({ letter: 'F', accidental: 'n', octave: 4 })).toBe('F♮4');
    expect(midiToName(70)).toBe('A#4');
    expect(midiToName(70, 'flat')).toBe('Bb4');
  });

  it('diatonic indices are contiguous across letters', () => {
    expect(diatonicIndex('C', 4)).toBe(28);
    expect(diatonicIndex('B', 3)).toBe(27);
    expect(spellingFromDiatonic(28)).toEqual({ letter: 'C', accidental: '', octave: 4 });
    expect(spellingFromDiatonic(27)).toEqual({ letter: 'B', accidental: '', octave: 3 });
    expect(parseNoteName('F#4')).toEqual({ index: diatonicIndex('F', 4), accidental: '#' });
    expect(parseNoteName('Bb3')).toEqual({ index: diatonicIndex('B', 3), accidental: 'b' });
  });

  it('counts white keys and snaps to octaves', () => {
    expect(whiteKeysBetween(60, 71)).toBe(7);
    expect(whiteKeysBetween(60, 72)).toBe(8);
    expect(floorToC(67)).toBe(60);
    expect(ceilToB(67)).toBe(71);
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(64)).toBe(false);
  });
});

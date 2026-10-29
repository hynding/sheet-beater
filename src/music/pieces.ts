import { parsePiece, type Piece, type PieceDefinition } from './score';

/**
 * Short excerpts of public-domain pieces in simplified arrangements written
 * for this app: a melody line over a light left hand, enough to recognise
 * each piece and play along with it.
 */

const ENTERTAINER_BASS_C = 'C3/8 [E3,G3,C4]/8 G2/8 [E3,G3,C4]/8';
const ENTERTAINER_BASS_G7 = 'G2/8 [F3,G3,B3]/8 D3/8 [F3,G3,B3]/8';

const DEFINITIONS: PieceDefinition[] = [
  {
    id: 'entertainer',
    title: 'The Entertainer',
    composer: 'Scott Joplin (1902)',
    description: 'The opening strain of the famous rag. Syncopated right hand over an oom-pah left hand.',
    key: 'C',
    timeSignature: [2, 4],
    tempo: 84,
    treble: [
      'r/qr r/16r D5/16 D#5/16 E5/16',
      'C5/8 E5/16 C5/8 E5/16 C5/8',
      'C5/q r/16r C5/16 D5/16 D#5/16',
      'E5/16 C5/16 D5/16 E5/8 B4/16 D5/8',
      'C5/q r/16r D5/16 D#5/16 E5/16',
      'C5/8 E5/16 C5/8 E5/16 C5/8',
      'C5/q r/16r C5/16 D5/16 D#5/16',
      'E5/16 C5/16 D5/16 E5/8 B4/16 D5/8',
      'C5/q r/16r C5/16 D5/16 E5/16',
      'A4/16 G4/16 F#4/16 A4/16 C5/8 E5/8',
      'D5/16 C5/16 A4/16 D5/8 r/8r r/16r',
      'A4/16 G4/16 F#4/16 A4/16 C5/8 E5/8',
      'D5/16 C5/16 A4/16 D5/q r/16r',
    ].join(' | '),
    bass: [
      'r/hr',
      ENTERTAINER_BASS_C,
      ENTERTAINER_BASS_C,
      ENTERTAINER_BASS_G7,
      ENTERTAINER_BASS_C,
      ENTERTAINER_BASS_C,
      ENTERTAINER_BASS_C,
      ENTERTAINER_BASS_G7,
      ENTERTAINER_BASS_C,
      ENTERTAINER_BASS_C,
      'D3/8 [F#3,A3,C4]/8 G2/8 [F3,G3,B3]/8',
      ENTERTAINER_BASS_C,
      'G2/8 [F3,G3,B3]/8 C3/8 [E3,G3,C4]/8',
    ].join(' | '),
  },
  {
    id: 'moonlight',
    title: 'Moonlight Sonata',
    composer: 'Ludwig van Beethoven (1801), Piano Sonata No. 14, first movement',
    description: 'The opening bars: a slow wash of broken chords, then the melody enters on a repeated G sharp.',
    key: 'E',
    keyLabel: 'C sharp minor, 4 sharps',
    timeSignature: [12, 8],
    tempo: 52,
    treble: [
      'G#3/8 C#4/8 E4/8 G#3/8 C#4/8 E4/8 G#3/8 C#4/8 E4/8 G#3/8 C#4/8 E4/8',
      'G#3/8 C#4/8 E4/8 G#3/8 C#4/8 E4/8 G#3/8 C#4/8 E4/8 G#3/8 C#4/8 E4/8',
      'A3/8 C#4/8 E4/8 A3/8 C#4/8 E4/8 A3/8 D4/8 F#4/8 A3/8 D4/8 F#4/8',
      'G#3/8 B#3/8 F#4/8 G#3/8 B#3/8 F#4/8 G#3/8 C#4/8 E4/8 G#3/8 C#4/8 D#4/8',
      '[G#3,G#4]/8 C#4/8 E4/8 G#3/8 C#4/8 E4/8 [G#3,G#4]/8 C#4/8 [E4,G#4]/8 [G#3,G#4]/8 C#4/8 E4/8',
      '[G#3,G#4]/8 C#4/8 E4/8 G#3/8 C#4/8 E4/8 G#3/8 C#4/8 E4/8 G#3/8 C#4/8 E4/8',
      '[A3,A4]/8 C#4/8 E4/8 A3/8 C#4/8 E4/8 A3/8 D4/8 F#4/8 A3/8 D4/8 F#4/8',
      '[G#3,G#4]/8 B#3/8 F#4/8 G#3/8 B#3/8 F#4/8 [G#3,G#4]/8 C#4/8 E4/8 G#3/8 C#4/8 D#4/8',
    ].join(' | '),
    bass: [
      '[C#2,C#3]/wd',
      '[B1,B2]/wd',
      '[A1,A2]/hd [F#1,F#2]/hd',
      '[G#1,G#2]/hd [G#1,G#2]/hd',
      '[C#2,C#3]/wd',
      '[C#2,C#3]/wd',
      '[A1,A2]/hd [F#1,F#2]/hd',
      '[G#1,G#2]/hd [G#1,G#2]/hd',
    ].join(' | '),
  },
  {
    id: 'canon',
    title: 'Canon in D',
    composer: 'Johann Pachelbel (c. 1680)',
    description: 'The ground bass repeats every two bars while the melody grows from half notes to quarters to eighths.',
    key: 'D',
    timeSignature: [4, 4],
    tempo: 60,
    treble: [
      'F#5/h E5/h',
      'D5/h C#5/h',
      'B4/h A4/h',
      'B4/h C#5/h',
      'D4/q F#4/q A4/q G4/q',
      'F#4/q D4/q F#4/q E4/q',
      'D4/q B3/q D4/q A4/q',
      'G4/q B4/q A4/q G4/q',
      'F#4/q D4/q E4/q C#5/q',
      'D5/q F#5/q A5/q A4/q',
      'B4/q G4/q A4/q F#4/q',
      'D4/q D5/q D5/q C#5/q',
      'D5/8 C#5/8 D5/8 D4/8 C#4/8 A4/8 E4/8 F#4/8',
      'D4/8 D5/8 C#5/8 B4/8 C#5/8 F#5/8 A5/8 B5/8',
      'G5/8 F#5/8 E5/8 G5/8 F#5/8 E5/8 D5/8 C#5/8',
      'B4/8 A4/8 G4/8 F#4/8 E4/8 G4/8 F#4/8 E4/8',
    ].join(' | '),
    bass: Array.from({ length: 4 }, () => ['[D3,F#3]/h [A2,C#3]/h', '[B2,D3]/h [F#2,A2]/h', '[G2,B2]/h [D2,F#2]/h', '[G2,B2]/h [A2,C#3]/h'].join(' | ')).join(' | '),
  },
];

export const PIECES: Piece[] = DEFINITIONS.map(parsePiece);

export function pieceById(id: string): Piece | undefined {
  return PIECES.find((p) => p.id === id);
}

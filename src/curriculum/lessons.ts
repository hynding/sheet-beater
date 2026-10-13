import { BASE_CONFIG, type Clef, type SessionConfig } from '../music/difficulty';
import type { KeyName } from '../music/keys';

export interface LessonPreview {
  clef: Clef;
  notes: string[];
  key?: KeyName;
}

export interface Lesson {
  id: string;
  unitId: string;
  title: string;
  /** One line shown on the path. */
  summary: string;
  /** Teaching text shown before the lesson starts. */
  intro: string[];
  /** A mnemonic or rule of thumb, shown as a tip. */
  tip?: string;
  /** Notes to draw on the intro card with their names. */
  preview?: LessonPreview;
  config: SessionConfig;
  /** Accuracy needed for the first star. */
  mastery: number;
  /** Average response time (ms per event) for the third star. */
  targetMs: number;
}

export interface Unit {
  id: string;
  title: string;
  description: string;
  lessons: Lesson[];
}

type LessonSpec = Omit<Lesson, 'id' | 'unitId' | 'config' | 'mastery' | 'targetMs'> & {
  config: Partial<SessionConfig>;
  mastery?: number;
  targetMs?: number;
};

function unit(id: string, title: string, description: string, specs: LessonSpec[]): Unit {
  const lessons = specs.map((spec, i) => ({
    ...spec,
    id: `${id}.${i + 1}`,
    unitId: id,
    config: { ...BASE_CONFIG, ...spec.config },
    mastery: spec.mastery ?? 0.8,
    targetMs: spec.targetMs ?? defaultTargetMs(spec.config.mode ?? 'single'),
  }));
  return { id, title, description, lessons };
}

function defaultTargetMs(mode: SessionConfig['mode']): number {
  switch (mode) {
    case 'sequence':
      return 2000;
    case 'chord':
      return 4500;
    case 'rhythm':
      return 0;
    default:
      return 2500;
  }
}

const TREBLE_LINES = ['E4', 'G4', 'B4', 'D5', 'F5'];
const TREBLE_SPACES = ['F4', 'A4', 'C5', 'E5'];
const BASS_LINES = ['G2', 'B2', 'D3', 'F3', 'A3'];
const BASS_SPACES = ['A2', 'C3', 'E3', 'G3'];

export const UNITS: Unit[] = [
  unit('treble', 'The treble clef', 'Where the right hand lives. Landmarks first, then lines, spaces and the whole staff.', [
    {
      title: 'Three landmarks',
      summary: 'Middle C, G4 and C5',
      intro: [
        'The treble clef is also called the G clef: its curl wraps around the second line from the bottom, and that line is G4, the G just above middle C.',
        'Middle C sits below the staff on its own short line, called a ledger line. C5 sits in the third space. Learn these three by sight and every other note is only a step or two away.',
      ],
      tip: 'Find middle C on your keyboard: it is the C nearest the middle, just left of the group of two black keys.',
      preview: { clef: 'treble', notes: ['C4', 'G4', 'C5'] },
      config: { clef: 'treble', notePool: [{ clef: 'treble', notes: ['C4', 'G4', 'C5'] }], noteCount: 8 },
      targetMs: 3000,
    },
    {
      title: 'The lines',
      summary: 'E G B D F',
      intro: [
        'Notes that sit on a line, with the line passing through the notehead, are line notes. From the bottom up the treble lines are E, G, B, D and F.',
        'Notice that each line is a third above the one below: skipping one letter every time.',
      ],
      tip: 'Every Good Boy Does Fine.',
      preview: { clef: 'treble', notes: TREBLE_LINES },
      config: { clef: 'treble', notePool: [{ clef: 'treble', notes: TREBLE_LINES }], noteCount: 12 },
    },
    {
      title: 'The spaces',
      summary: 'F A C E',
      intro: [
        'Notes that sit between two lines are space notes. From the bottom up the treble spaces spell a word: F, A, C, E.',
        'Lines and spaces alternate, so moving from a line to the next space is one step, one letter.',
      ],
      tip: 'The spaces spell FACE.',
      preview: { clef: 'treble', notes: TREBLE_SPACES },
      config: { clef: 'treble', notePool: [{ clef: 'treble', notes: TREBLE_SPACES }], noteCount: 12 },
    },
    {
      title: 'The whole treble staff',
      summary: 'D4 to G5, lines and spaces together',
      intro: [
        'Now lines and spaces are mixed. When a note is unfamiliar, find the nearest landmark and count steps from it: each line or space is one letter.',
        'D4 hangs just under the bottom line and G5 sits just above the top line. Neither needs a ledger line.',
      ],
      preview: { clef: 'treble', notes: ['D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'] },
      config: { clef: 'treble', maxLedgerLines: 0, noteCount: 16 },
    },
    {
      title: 'Ledger lines',
      summary: 'Two ledger lines above and below',
      intro: [
        'When the music goes past the five lines, short extra lines are drawn just for that note. They continue the same pattern of lines and spaces.',
        'Below the treble staff: C4 on the first ledger line, A3 on the second. Above: A5 on the first, C6 on the second.',
      ],
      tip: 'Count ledger lines, not noteheads: each ledger line is a third above or below the last.',
      preview: { clef: 'treble', notes: ['A3', 'B3', 'C4', 'A5', 'B5', 'C6'] },
      config: { clef: 'treble', maxLedgerLines: 2, noteCount: 20 },
      targetMs: 3000,
    },
  ]),

  unit('bass', 'The bass clef', 'The left hand\'s staff. Same shapes, different letters.', [
    {
      title: 'Three landmarks',
      summary: 'F3, middle C and C3',
      intro: [
        'The bass clef is the F clef: its two dots sit either side of the fourth line, which is F3, the F below middle C.',
        'Middle C is above the bass staff on a ledger line, mirroring where it sits under the treble staff. C3 is in the second space.',
      ],
      tip: 'Middle C is the hinge between the two staves: one ledger line below treble, one ledger line above bass.',
      preview: { clef: 'bass', notes: ['C3', 'F3', 'C4'] },
      config: { clef: 'bass', notePool: [{ clef: 'bass', notes: ['C3', 'F3', 'C4'] }], noteCount: 8 },
      targetMs: 3000,
    },
    {
      title: 'The lines',
      summary: 'G B D F A',
      intro: ['From the bottom up the bass lines are G, B, D, F and A. Every line is still a third above the one below.'],
      tip: 'Good Boys Do Fine Always.',
      preview: { clef: 'bass', notes: BASS_LINES },
      config: { clef: 'bass', notePool: [{ clef: 'bass', notes: BASS_LINES }], noteCount: 12 },
    },
    {
      title: 'The spaces',
      summary: 'A C E G',
      intro: ['The bass spaces from the bottom up are A, C, E and G.'],
      tip: 'All Cows Eat Grass.',
      preview: { clef: 'bass', notes: BASS_SPACES },
      config: { clef: 'bass', notePool: [{ clef: 'bass', notes: BASS_SPACES }], noteCount: 12 },
    },
    {
      title: 'The whole bass staff',
      summary: 'F2 to B3',
      intro: ['Lines and spaces mixed, from F2 just under the staff to B3 just above it. Count from the F3 landmark when in doubt.'],
      preview: { clef: 'bass', notes: ['F2', 'G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'] },
      config: { clef: 'bass', maxLedgerLines: 0, noteCount: 16 },
    },
    {
      title: 'Ledger lines',
      summary: 'Two ledger lines above and below',
      intro: ['Above the bass staff: C4 on the first ledger line, E4 on the second. Below: E2 on the first, C2 on the second.'],
      preview: { clef: 'bass', notes: ['C2', 'D2', 'E2', 'C4', 'D4', 'E4'] },
      config: { clef: 'bass', maxLedgerLines: 2, noteCount: 20 },
      targetMs: 3000,
    },
  ]),

  unit('grand', 'The grand staff', 'Both clefs joined by a brace, the way piano music is written.', [
    {
      title: 'Two staves, one brace',
      summary: 'Treble and bass, notes on the staff',
      intro: [
        'Piano music joins the treble and bass staves with a brace. The top staff is usually the right hand and the bottom staff the left.',
        'Each note tells you which staff it is on, so the first thing to check is the clef, then the position.',
      ],
      config: { clef: 'grand', maxLedgerLines: 0, noteCount: 16 },
    },
    {
      title: 'Middle C from both sides',
      summary: 'One ledger line on every side',
      intro: [
        'Middle C is the same key whether it is written under the treble staff or over the bass staff. The composer chooses the staff that keeps the notes of one hand together.',
        'This lesson adds one ledger line in every direction, so middle C, D4 and B3 appear on both staves.',
      ],
      preview: { clef: 'treble', notes: ['B3', 'C4', 'D4'] },
      config: { clef: 'grand', maxLedgerLines: 1, innerLedgerLines: 1, noteCount: 20 },
    },
    {
      title: 'Reaching out',
      summary: 'Two ledger lines away from the middle',
      intro: ['Two ledger lines above the treble staff and below the bass staff. Keep counting in thirds from the last line you know.'],
      config: { clef: 'grand', maxLedgerLines: 2, innerLedgerLines: 1, noteCount: 24 },
    },
    {
      title: 'Crossing the middle',
      summary: 'Notes between the staves on either clef',
      intro: [
        'Real scores often write a note on the "wrong" staff, with several ledger lines, so that one hand\'s notes stay together. A3 can be written under the treble staff and E4 over the bass staff.',
        'Read the clef first, then count the ledger lines. The pitch is the same wherever it is written.',
      ],
      config: { clef: 'grand', maxLedgerLines: 3, innerLedgerLines: 3, noteCount: 24 },
      targetMs: 3500,
    },
  ]),

  unit('phrases', 'Reading phrases', 'Several notes at a time. Read the shape, not just each note.', [
    {
      title: 'Steps',
      summary: 'Three-note phrases that move by step',
      intro: [
        'Play the highlighted note; the next one lights up as soon as you get it right.',
        'Most melodies move by step, from a line to the next space or back. Once you know the first note, read the direction and distance instead of naming every note.',
      ],
      tip: 'Line to space is one step. Line to line is a skip.',
      config: { mode: 'sequence', clef: 'treble', maxLedgerLines: 1, sequenceLength: 3, noteCount: 8 },
    },
    {
      title: 'Steps and skips',
      summary: 'Four-note phrases on both staves',
      intro: ['Phrases now include skips of a third and occasional larger leaps, on either staff.'],
      config: { mode: 'sequence', clef: 'grand', maxLedgerLines: 1, sequenceLength: 4, noteCount: 10 },
    },
    {
      title: 'Longer phrases',
      summary: 'Five notes with ledger lines',
      intro: ['Five-note phrases reaching two ledger lines out. Keep your eyes a note ahead of your fingers.'],
      config: { mode: 'sequence', clef: 'grand', maxLedgerLines: 2, sequenceLength: 5, noteCount: 10 },
    },
  ]),

  unit('accidentals', 'Sharps and flats', 'Black keys and the signs that ask for them.', [
    {
      title: 'Sharps',
      summary: 'A sharp raises a note to the next key up',
      intro: [
        'A sharp sign before a note raises it by a half step: the very next key to the right, usually a black key. F sharp is the black key just right of F.',
        'E sharp and B sharp exist in theory but you will not see them here: every sharp in this lesson is a black key.',
      ],
      preview: { clef: 'treble', notes: ['F#4', 'G#4', 'C#5'] },
      config: { clef: 'grand', maxLedgerLines: 1, accidentals: 'sharps', accidentalChance: 0.5, noteCount: 16 },
    },
    {
      title: 'Flats',
      summary: 'A flat lowers a note to the next key down',
      intro: ['A flat sign lowers the note by a half step: the next key to the left. B flat is the black key just left of B.'],
      preview: { clef: 'treble', notes: ['Bb4', 'Eb5', 'Ab4'] },
      config: { clef: 'grand', maxLedgerLines: 1, accidentals: 'flats', accidentalChance: 0.5, noteCount: 16 },
    },
    {
      title: 'Sharps and flats mixed',
      summary: 'Both signs, both staves',
      intro: ['Every black key has two names: F sharp is also G flat. Read the letter, then move one key in the direction the sign tells you.'],
      config: { clef: 'grand', maxLedgerLines: 1, accidentals: 'mixed', accidentalChance: 0.5, noteCount: 20 },
    },
    {
      title: 'Accidentals in phrases',
      summary: 'An accidental lasts for the rest of the bar',
      intro: [
        'Inside a bar an accidental stays in force: if the first F is sharp, every later F in that bar on the same line or space is sharp too, even without a sign.',
        'A natural sign cancels it. At the barline everything resets.',
      ],
      config: { mode: 'sequence', clef: 'grand', maxLedgerLines: 1, accidentals: 'mixed', accidentalChance: 0.4, sequenceLength: 4, noteCount: 10 },
    },
  ]),

  unit('keys', 'Key signatures', 'Sharps and flats declared once, at the start of every line.', [
    {
      title: 'One sharp: G major',
      summary: 'Every F is F sharp',
      intro: [
        'A key signature is written after the clef. One sharp on the F line means every F in the piece is F sharp, in every octave, unless a natural sign says otherwise.',
        'G major has one sharp. Its relative minor, E minor, shares the same signature.',
      ],
      tip: 'Sharps are added in the order F C G D A E B.',
      preview: { clef: 'treble', notes: ['F4', 'G4', 'A4', 'F5'], key: 'G' },
      config: { clef: 'grand', maxLedgerLines: 1, keys: ['G'], noteCount: 16 },
    },
    {
      title: 'One flat: F major',
      summary: 'Every B is B flat',
      intro: ['One flat on the B line means every B is B flat. F major and D minor share this signature.'],
      tip: 'Flats are added in the order B E A D G C F, the sharp order backwards.',
      preview: { clef: 'treble', notes: ['B4', 'A4', 'F4', 'B3'], key: 'F' },
      config: { clef: 'grand', maxLedgerLines: 1, keys: ['F'], noteCount: 16 },
    },
    {
      title: 'Two sharps, two flats',
      summary: 'D major and B flat major',
      intro: ['D major has F sharp and C sharp. B flat major has B flat and E flat. Check the signature before every prompt: the key changes between prompts.'],
      config: { clef: 'grand', maxLedgerLines: 1, keys: ['D', 'Bb'], noteCount: 20 },
    },
    {
      title: 'Three and four',
      summary: 'A, E, E flat and A flat major',
      intro: ['A major adds G sharp; E major adds D sharp. E flat major adds A flat; A flat major adds D flat.'],
      tip: 'For sharp keys, the key is a half step above the last sharp. For flat keys, the key is the second-to-last flat.',
      config: { clef: 'grand', maxLedgerLines: 1, keys: ['A', 'E', 'Eb', 'Ab'], noteCount: 24 },
    },
    {
      title: 'Naturals in a key',
      summary: 'A natural sign cancels the key signature',
      intro: ['When a note from the key signature should be played without its sharp or flat, a natural sign is written. In G major, an F with a natural sign is the white key F.'],
      config: { clef: 'grand', maxLedgerLines: 1, keys: ['G', 'D', 'F', 'Bb'], accidentals: 'mixed', accidentalChance: 0.3, noteCount: 20 },
    },
    {
      title: 'Phrases in every key',
      summary: 'Four-note phrases, all keys',
      intro: ['Phrases in any of the keys you have learned. Glance at the signature, then read the shape.'],
      config: { mode: 'sequence', clef: 'grand', maxLedgerLines: 1, keys: ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb', 'Ab'], sequenceLength: 4, noteCount: 12 },
    },
  ]),

  unit('chords', 'Chords', 'Notes stacked together. Read them as shapes.', [
    {
      title: 'Intervals',
      summary: 'Thirds, fourths, fifths, sixths and octaves',
      intro: [
        'Two notes stacked together are an interval. Press both keys, in either order. On a MIDI keyboard you can play them together.',
        'A third is two notes on neighbouring lines or neighbouring spaces. A fifth skips one line or space. An octave is always a line and a space.',
      ],
      tip: 'Odd intervals (3rd, 5th, 7th) are line-line or space-space. Even intervals (4th, 6th, octave) are line-space.',
      config: { mode: 'chord', clef: 'treble', maxLedgerLines: 1, chordKinds: ['interval'], noteCount: 10 },
    },
    {
      title: 'Triads',
      summary: 'Three notes a third apart',
      intro: ['A triad is three notes stacked in thirds: all on lines or all in spaces, like a snowman. Find the bottom note and add the next two of the same kind.'],
      config: { mode: 'chord', clef: 'grand', maxLedgerLines: 1, chordKinds: ['triad'], noteCount: 10 },
    },
    {
      title: 'Inversions',
      summary: 'The same chord with a note moved up an octave',
      intro: ['An inversion moves the bottom note of a triad to the top. The shape is no longer a neat snowman: look for the gap of a fourth, which marks where the root is.'],
      config: { mode: 'chord', clef: 'grand', maxLedgerLines: 1, chordKinds: ['triad', 'inversion'], noteCount: 12 },
    },
    {
      title: 'Chords in keys',
      summary: 'Every shape, with key signatures',
      intro: ['Chords in G, D, F and B flat major. The key signature changes the black keys you need without changing the shape on the page.'],
      config: { mode: 'chord', clef: 'grand', maxLedgerLines: 1, keys: ['G', 'D', 'F', 'Bb'], chordKinds: ['interval', 'triad', 'inversion'], noteCount: 12 },
    },
  ]),

  unit('rhythm', 'Rhythm', 'Play in time with a metronome. Pitch and timing both count.', [
    {
      title: 'Steady quarter notes',
      summary: 'Four beats a bar, one note per beat',
      intro: [
        'A metronome counts one bar in, then the cursor moves across the bar. Play each note as the cursor reaches it.',
        'A quarter note lasts one beat. In 4/4 time there are four beats in every bar.',
      ],
      tip: 'Count out loud: one, two, three, four.',
      config: { mode: 'rhythm', clef: 'treble', maxLedgerLines: 1, tempo: 66, timeSignature: [4, 4], durations: ['q'], noteCount: 6 },
    },
    {
      title: 'Half and whole notes',
      summary: 'Notes that last two and four beats',
      intro: ['A half note (hollow head with a stem) lasts two beats. A whole note (hollow, no stem) lasts the whole bar. Hold the key, or at least wait, for the full value.'],
      config: { mode: 'rhythm', clef: 'treble', maxLedgerLines: 1, tempo: 72, timeSignature: [4, 4], durations: ['q', 'h', 'w'], noteCount: 8 },
    },
    {
      title: 'Rests',
      summary: 'Counted silence',
      intro: ['A rest is a beat of silence. A quarter rest looks like a squiggle; a half rest sits on top of the middle line. Keep counting through them and do not play.'],
      config: { mode: 'rhythm', clef: 'grand', maxLedgerLines: 1, tempo: 72, timeSignature: [4, 4], durations: ['q', 'h', 'qr', 'hr'], noteCount: 8 },
    },
    {
      title: 'Three beats a bar',
      summary: '3/4 time with dotted half notes',
      intro: ['In 3/4 time each bar has three beats. A dot after a note adds half its value, so a dotted half note lasts three beats: a whole bar of 3/4.'],
      config: { mode: 'rhythm', clef: 'grand', maxLedgerLines: 1, tempo: 76, timeSignature: [3, 4], durations: ['q', 'h', 'hd'], noteCount: 8 },
    },
    {
      title: 'Eighth notes',
      summary: 'Two notes to a beat',
      intro: ['Eighth notes have a flag, or a beam joining them in pairs. Two eighths fit in one beat: count "one and two and".'],
      config: { mode: 'rhythm', clef: 'grand', maxLedgerLines: 1, tempo: 66, timeSignature: [4, 4], durations: ['q', 'h', '8'], noteCount: 8 },
    },
    {
      title: 'Everything together',
      summary: 'All durations, rests and key signatures',
      intro: ['Full bars in C, G and F major with every duration you have met. This is sight-reading.'],
      config: {
        mode: 'rhythm',
        clef: 'grand',
        maxLedgerLines: 2,
        keys: ['C', 'G', 'F'],
        tempo: 80,
        timeSignature: [4, 4],
        durations: ['q', 'h', 'w', '8', 'qr', 'hr'],
        noteCount: 10,
      },
      mastery: 0.75,
    },
  ]),
];

export const LESSONS: Lesson[] = UNITS.flatMap((u) => u.lessons);

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function unitOf(lesson: Lesson): Unit {
  return UNITS.find((u) => u.id === lesson.unitId)!;
}

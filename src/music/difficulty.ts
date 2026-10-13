import type { KeyName } from './keys';

export type ClefMode = 'treble' | 'bass' | 'grand';
export type Clef = 'treble' | 'bass';
export type AccidentalMode = 'none' | 'sharps' | 'flats' | 'mixed';
export type SessionMode = 'single' | 'sequence' | 'chord' | 'rhythm';
/** VexFlow-style durations; a trailing r is a rest, d a dot. */
export type Duration = 'w' | 'h' | 'hd' | 'q' | '8' | 'qr' | 'hr';
export type ChordKind = 'interval' | 'triad' | 'inversion';
export type KeyLabelMode = 'always' | 'onMistake' | 'never';
export type KeyboardSize = 'small' | 'medium' | 'large';
export type PresetId = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

/** An explicit list of notes (natural names like "E4") to draw from on one clef. */
export interface NotePool {
  clef: Clef;
  notes: string[];
}

/** Everything that defines what a session asks for. Lessons and free practice both produce one. */
export interface SessionConfig {
  mode: SessionMode;
  clef: ClefMode;
  /** Ledger lines allowed away from the middle of the grand staff (or either side of a single staff). */
  maxLedgerLines: number;
  /** Grand staff only: ledger lines allowed toward the other staff. 1 means middle C is the limit. */
  innerLedgerLines: number;
  /** When set, replaces the ledger-line based range with explicit notes. */
  notePool?: NotePool[];
  accidentals: AccidentalMode;
  /** Probability (0-1) that a note gets an accidental when accidentals are enabled. */
  accidentalChance: number;
  /** Key signatures to draw from. */
  keys: KeyName[];
  /** Prompts per session (notes, phrases, chords or bars depending on mode). */
  noteCount: number;
  /** Per-prompt time limit in ms; 0 = untimed. Ignored in rhythm mode. */
  timeLimitMs: number;
  /** Sequence mode: notes per phrase. */
  sequenceLength: number;
  /** Chord mode: which chord shapes may appear. */
  chordKinds: ChordKind[];
  /** Rhythm mode. */
  tempo: number;
  timeSignature: [number, number];
  durations: Duration[];
}

export interface Settings extends SessionConfig {
  preset: PresetId | 'custom';
  sound: boolean;
  keyLabels: KeyLabelMode;
  keyboardSize: KeyboardSize;
}

export const BASE_CONFIG: SessionConfig = {
  mode: 'single',
  clef: 'treble',
  maxLedgerLines: 0,
  innerLedgerLines: 1,
  accidentals: 'none',
  accidentalChance: 0,
  keys: ['C'],
  noteCount: 10,
  timeLimitMs: 0,
  sequenceLength: 4,
  chordKinds: ['interval', 'triad'],
  tempo: 72,
  timeSignature: [4, 4],
  durations: ['q', 'h'],
};

export interface Preset {
  id: PresetId;
  name: string;
  tagline: string;
  config: Partial<SessionConfig>;
}

export const PRESETS: Preset[] = [
  { id: 'beginner', name: 'Beginner', tagline: 'Treble clef, notes on the staff only.', config: { clef: 'treble', maxLedgerLines: 0, noteCount: 10 } },
  { id: 'easy', name: 'Easy', tagline: 'Bass clef, notes on the staff only.', config: { clef: 'bass', maxLedgerLines: 0, noteCount: 15 } },
  { id: 'medium', name: 'Medium', tagline: 'Grand staff with one ledger line.', config: { clef: 'grand', maxLedgerLines: 1, noteCount: 20 } },
  {
    id: 'hard',
    name: 'Hard',
    tagline: 'Two ledger lines, sharps and flats, 8 s per note.',
    config: { clef: 'grand', maxLedgerLines: 2, accidentals: 'mixed', accidentalChance: 0.3, noteCount: 25, timeLimitMs: 8000 },
  },
  {
    id: 'expert',
    name: 'Expert',
    tagline: 'Three ledger lines either way, key signatures, 4 s per note.',
    config: {
      clef: 'grand',
      maxLedgerLines: 3,
      innerLedgerLines: 3,
      accidentals: 'mixed',
      accidentalChance: 0.3,
      keys: ['C', 'G', 'D', 'F', 'Bb'],
      noteCount: 30,
      timeLimitMs: 4000,
    },
  },
];

export const DEFAULT_SETTINGS: Settings = {
  ...BASE_CONFIG,
  ...PRESETS[0].config,
  preset: 'beginner',
  sound: true,
  keyLabels: 'onMistake',
  keyboardSize: 'medium',
};

const CONFIG_KEYS = Object.keys(BASE_CONFIG) as Array<keyof SessionConfig>;

export function configOf(settings: SessionConfig): SessionConfig {
  const out = {} as Record<string, unknown>;
  for (const k of CONFIG_KEYS) out[k] = settings[k];
  if (settings.notePool) out.notePool = settings.notePool;
  return out as unknown as SessionConfig;
}

export function applyPreset(settings: Settings, id: PresetId): Settings {
  const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  const { notePool: _drop, ...rest } = settings;
  void _drop;
  return { ...rest, ...BASE_CONFIG, ...preset.config, preset: preset.id };
}

/** Returns the preset id whose session config matches, or 'custom'. */
export function detectPreset(settings: Settings): PresetId | 'custom' {
  const current = JSON.stringify(configOf(settings));
  const match = PRESETS.find((p) => JSON.stringify(configOf({ ...BASE_CONFIG, ...p.config })) === current);
  return match?.id ?? 'custom';
}

const STORAGE_KEY = 'sheet-beater.settings.v2';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    return { ...merged, preset: detectPreset(merged) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode, etc.) - settings just won't persist */
  }
}

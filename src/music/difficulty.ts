export type ClefMode = 'treble' | 'bass' | 'grand';
export type AccidentalMode = 'none' | 'sharps' | 'flats' | 'mixed';
export type KeyLabelMode = 'always' | 'onMistake' | 'never';
export type KeyboardSize = 'small' | 'medium' | 'large';
export type PresetId = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

export interface Settings {
  preset: PresetId | 'custom';
  /** Which staff (or both, as a grand staff) notes are drawn on. */
  clef: ClefMode;
  /** How many ledger lines above/below each staff notes may use (0-3). */
  maxLedgerLines: number;
  accidentals: AccidentalMode;
  /** Probability (0-1) that a note gets an accidental when accidentals are enabled. */
  accidentalChance: number;
  /** Notes per session. */
  noteCount: number;
  /** Per-note time limit in ms; 0 = untimed. */
  timeLimitMs: number;
  sound: boolean;
  keyLabels: KeyLabelMode;
  keyboardSize: KeyboardSize;
}

export interface Preset {
  id: PresetId;
  name: string;
  tagline: string;
  settings: Omit<Settings, 'preset' | 'sound' | 'keyLabels' | 'keyboardSize'>;
}

export const PRESETS: Preset[] = [
  {
    id: 'beginner',
    name: 'Beginner',
    tagline: 'Treble clef, notes on the staff only.',
    settings: { clef: 'treble', maxLedgerLines: 0, accidentals: 'none', accidentalChance: 0, noteCount: 10, timeLimitMs: 0 },
  },
  {
    id: 'easy',
    name: 'Easy',
    tagline: 'Bass clef, notes on the staff only.',
    settings: { clef: 'bass', maxLedgerLines: 0, accidentals: 'none', accidentalChance: 0, noteCount: 15, timeLimitMs: 0 },
  },
  {
    id: 'medium',
    name: 'Medium',
    tagline: 'Grand staff with one ledger line.',
    settings: { clef: 'grand', maxLedgerLines: 1, accidentals: 'none', accidentalChance: 0, noteCount: 20, timeLimitMs: 0 },
  },
  {
    id: 'hard',
    name: 'Hard',
    tagline: 'Two ledger lines, sharps and flats, 8 s per note.',
    settings: { clef: 'grand', maxLedgerLines: 2, accidentals: 'mixed', accidentalChance: 0.3, noteCount: 25, timeLimitMs: 8000 },
  },
  {
    id: 'expert',
    name: 'Expert',
    tagline: 'Three ledger lines, frequent accidentals, 4 s per note.',
    settings: { clef: 'grand', maxLedgerLines: 3, accidentals: 'mixed', accidentalChance: 0.5, noteCount: 30, timeLimitMs: 4000 },
  },
];

export const DEFAULT_SETTINGS: Settings = {
  preset: 'beginner',
  ...PRESETS[0].settings,
  sound: true,
  keyLabels: 'onMistake',
  keyboardSize: 'medium',
};

export function applyPreset(settings: Settings, id: PresetId): Settings {
  const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  return { ...settings, ...preset.settings, preset: preset.id };
}

/** Returns the preset id whose difficulty fields match, or 'custom'. */
export function detectPreset(settings: Settings): PresetId | 'custom' {
  const keys = ['clef', 'maxLedgerLines', 'accidentals', 'accidentalChance', 'noteCount', 'timeLimitMs'] as const;
  const match = PRESETS.find((p) => keys.every((k) => p.settings[k] === settings[k]));
  return match?.id ?? 'custom';
}

const STORAGE_KEY = 'sheet-beater.settings.v1';

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

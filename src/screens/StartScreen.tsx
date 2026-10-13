import { useState } from 'react';
import {
  PRESETS,
  applyPreset,
  detectPreset,
  type AccidentalMode,
  type ClefMode,
  type KeyLabelMode,
  type KeyboardSize,
  type PresetId,
  type Settings,
} from '../music/difficulty';
import { keyboardRangeFor } from '../music/generator';
import { midiToName } from '../music/notes';
import type { MidiStatus } from '../input/useMidiInput';

interface StartScreenProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onStart: () => void;
  midi: MidiStatus;
}

const TIME_LIMITS = [0, 10000, 8000, 6000, 4000, 3000, 2000];

export function StartScreen({ settings, onChange, onStart, midi }: StartScreenProps) {
  const [showCustom, setShowCustom] = useState(settings.preset === 'custom');
  const range = keyboardRangeFor(settings);
  const activePreset = PRESETS.find((p) => p.id === settings.preset);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    onChange({ ...next, preset: detectPreset(next) });
  };

  return (
    <div className="screen start">
      <header className="start__hero">
        <h1 className="brand">Sheet Beater</h1>
        <p className="muted">Read the note, play the key. Learn to sight-read at the piano.</p>
      </header>

      <section className="start__body">
        <div className="panel">
          <h2 className="panel__title">Difficulty</h2>
          <div className="presets" role="radiogroup" aria-label="Difficulty preset">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={settings.preset === p.id}
                className={`preset${settings.preset === p.id ? ' preset--active' : ''}`}
                onClick={() => onChange(applyPreset(settings, p.id as PresetId))}
              >
                <span className="preset__name">{p.name}</span>
                <span className="preset__tagline">{p.tagline}</span>
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={settings.preset === 'custom'}
              className={`preset${settings.preset === 'custom' ? ' preset--active' : ''}`}
              onClick={() => setShowCustom((v) => !v)}
            >
              <span className="preset__name">Custom</span>
              <span className="preset__tagline">{showCustom ? 'Hide options' : 'Pick your own mix'}</span>
            </button>
          </div>

          {showCustom && (
            <div className="fields">
              <label className="field">
                <span>Staff</span>
                <select value={settings.clef} onChange={(e) => update({ clef: e.target.value as ClefMode })}>
                  <option value="treble">Treble clef</option>
                  <option value="bass">Bass clef</option>
                  <option value="grand">Grand staff (both)</option>
                </select>
              </label>
              <label className="field">
                <span>Ledger lines</span>
                <select value={settings.maxLedgerLines} onChange={(e) => update({ maxLedgerLines: Number(e.target.value) })}>
                  <option value={0}>None (staff only)</option>
                  <option value={1}>Up to 1</option>
                  <option value={2}>Up to 2</option>
                  <option value={3}>Up to 3</option>
                </select>
              </label>
              <label className="field">
                <span>Accidentals</span>
                <select
                  value={settings.accidentals}
                  onChange={(e) => {
                    const accidentals = e.target.value as AccidentalMode;
                    update({ accidentals, accidentalChance: accidentals === 'none' ? 0 : settings.accidentalChance || 0.3 });
                  }}
                >
                  <option value="none">None</option>
                  <option value="sharps">Sharps</option>
                  <option value="flats">Flats</option>
                  <option value="mixed">Sharps and flats</option>
                </select>
              </label>
              {settings.accidentals !== 'none' && (
                <label className="field">
                  <span>Accidental chance: {Math.round(settings.accidentalChance * 100)}%</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={10}
                    value={Math.round(settings.accidentalChance * 100)}
                    onChange={(e) => update({ accidentalChance: Number(e.target.value) / 100 })}
                  />
                </label>
              )}
              <label className="field">
                <span>Notes per session: {settings.noteCount}</span>
                <input type="range" min={5} max={60} step={5} value={settings.noteCount} onChange={(e) => update({ noteCount: Number(e.target.value) })} />
              </label>
              <label className="field">
                <span>Time per note</span>
                <select value={settings.timeLimitMs} onChange={(e) => update({ timeLimitMs: Number(e.target.value) })}>
                  {TIME_LIMITS.map((ms) => (
                    <option key={ms} value={ms}>
                      {ms === 0 ? 'Untimed' : `${ms / 1000} seconds`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <p className="muted small">
            {activePreset ? `${activePreset.tagline} ` : 'Custom mix. '}
            Keyboard will span {midiToName(range.low)} to {midiToName(range.high)}.
          </p>
        </div>

        <div className="panel">
          <h2 className="panel__title">Options</h2>
          <div className="fields">
            <label className="field">
              <span>Key names on the piano</span>
              <select value={settings.keyLabels} onChange={(e) => update({ keyLabels: e.target.value as KeyLabelMode })}>
                <option value="always">Always</option>
                <option value="onMistake">Only after a mistake</option>
                <option value="never">Never</option>
              </select>
            </label>
            <label className="field">
              <span>Keyboard size</span>
              <select value={settings.keyboardSize} onChange={(e) => update({ keyboardSize: e.target.value as KeyboardSize })}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>
            <label className="field field--row">
              <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
              <span>Play sounds</span>
            </label>
          </div>
          <h2 className="panel__title">Input</h2>
          <ul className="muted small inputs">
            <li>Tap or click the on-screen keys.</li>
            <li>
              Computer keyboard: <kbd>A</kbd>–<kbd>K</kbd> are white keys, <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd> are black keys,{' '}
              <kbd>Z</kbd> / <kbd>X</kbd> change octave.
            </li>
            <li>
              MIDI keyboard:{' '}
              {midi.error
                ? `unavailable (${midi.error})`
                : midi.inputs.length
                  ? `connected (${midi.inputs.join(', ')})`
                  : midi.supported
                    ? 'none detected, plug one in and it will be picked up'
                    : 'not supported by this browser'}
            </li>
          </ul>
        </div>
      </section>

      <footer className="start__footer">
        <button type="button" className="btn btn--primary btn--big" onClick={onStart}>
          Start
        </button>
      </footer>
    </div>
  );
}

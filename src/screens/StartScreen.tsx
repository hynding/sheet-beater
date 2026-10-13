import { useState } from 'react';
import type { Lesson } from '../curriculum/lessons';
import { LESSONS } from '../curriculum/lessons';
import { nextLesson, type Progress } from '../curriculum/progress';
import type { MidiStatus } from '../input/useMidiInput';
import {
  PRESETS,
  applyPreset,
  detectPreset,
  type AccidentalMode,
  type ChordKind,
  type ClefMode,
  type Duration,
  type KeyLabelMode,
  type KeyboardSize,
  type PresetId,
  type SessionMode,
  type Settings,
} from '../music/difficulty';
import { keyboardRangeFor } from '../music/generator';
import { KEY_NAMES, type KeyName } from '../music/keys';
import { midiToName } from '../music/notes';
import { LearnPath } from './LearnPath';

export type StartTab = 'learn' | 'free';

interface StartScreenProps {
  tab: StartTab;
  onTab: (tab: StartTab) => void;
  settings: Settings;
  onChange: (settings: Settings) => void;
  onStartFree: () => void;
  progress: Progress;
  onSelectLesson: (lesson: Lesson) => void;
  midi: MidiStatus;
}

const TIME_LIMITS = [0, 10000, 8000, 6000, 4000, 3000, 2000];
const DURATION_LABELS: Record<Duration, string> = { w: 'Whole', h: 'Half', hd: 'Dotted half', q: 'Quarter', '8': 'Eighths', qr: 'Quarter rest', hr: 'Half rest' };
const CHORD_LABELS: Record<ChordKind, string> = { interval: 'Intervals', triad: 'Triads', inversion: 'Inversions' };

function toggle<T>(list: T[], item: T, min = 1): T[] {
  if (list.includes(item)) return list.length > min ? list.filter((x) => x !== item) : list;
  return [...list, item];
}

export function StartScreen({ tab, onTab, settings, onChange, onStartFree, progress, onSelectLesson, midi }: StartScreenProps) {
  const [showCustom, setShowCustom] = useState(settings.preset === 'custom');
  const range = keyboardRangeFor(settings);
  const activePreset = PRESETS.find((p) => p.id === settings.preset);
  const next = nextLesson(progress);
  const starred = LESSONS.filter((l) => (progress[l.id]?.stars ?? 0) > 0).length;

  const update = (patch: Partial<Settings>) => {
    const nextSettings = { ...settings, ...patch };
    onChange({ ...nextSettings, preset: detectPreset(nextSettings) });
  };

  return (
    <div className="screen start">
      <header className="start__hero">
        <h1 className="brand">Sheet Beater</h1>
        <nav className="tabs" aria-label="Mode">
          <button type="button" className={`tab${tab === 'learn' ? ' tab--active' : ''}`} onClick={() => onTab('learn')}>
            Learn
          </button>
          <button type="button" className={`tab${tab === 'free' ? ' tab--active' : ''}`} onClick={() => onTab('free')}>
            Free practice
          </button>
        </nav>
        <span className="muted small start__status">
          {tab === 'learn' ? `${starred} of ${LESSONS.length} lessons passed` : 'Read the note, play the key.'}
        </span>
      </header>

      {tab === 'learn' ? (
        <>
          <section className="start__body start__body--path">
            <LearnPath progress={progress} onSelect={onSelectLesson} />
          </section>
          <footer className="start__footer">
            <span className="muted small">
              Next up: <strong>{next.title}</strong>
            </span>
            <button type="button" className="btn btn--primary btn--big" onClick={() => onSelectLesson(next)}>
              {starred === 0 ? 'Start learning' : 'Continue'}
            </button>
          </footer>
        </>
      ) : (
        <>
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
                    <span>Exercise</span>
                    <select value={settings.mode} onChange={(e) => update({ mode: e.target.value as SessionMode })}>
                      <option value="single">Single notes</option>
                      <option value="sequence">Phrases</option>
                      <option value="chord">Chords</option>
                      <option value="rhythm">Rhythm (metronome)</option>
                    </select>
                  </label>
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
                  {settings.clef === 'grand' && settings.maxLedgerLines > 1 && (
                    <label className="field">
                      <span>Between the staves</span>
                      <select value={settings.innerLedgerLines} onChange={(e) => update({ innerLedgerLines: Number(e.target.value) })}>
                        <option value={1}>Nearest staff only</option>
                        <option value={settings.maxLedgerLines}>Either staff (crossing)</option>
                      </select>
                    </label>
                  )}
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
                      <input type="range" min={10} max={100} step={10} value={Math.round(settings.accidentalChance * 100)} onChange={(e) => update({ accidentalChance: Number(e.target.value) / 100 })} />
                    </label>
                  )}
                  <div className="field">
                    <span>Key signatures</span>
                    <div className="chips" role="group" aria-label="Key signatures">
                      {KEY_NAMES.map((k) => (
                        <button key={k} type="button" className={`chip${settings.keys.includes(k) ? ' chip--on' : ''}`} onClick={() => update({ keys: toggle<KeyName>(settings.keys, k) })}>
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="field">
                    <span>
                      {settings.mode === 'rhythm' ? 'Bars' : settings.mode === 'sequence' ? 'Phrases' : settings.mode === 'chord' ? 'Chords' : 'Notes'} per session: {settings.noteCount}
                    </span>
                    <input type="range" min={5} max={60} step={5} value={settings.noteCount} onChange={(e) => update({ noteCount: Number(e.target.value) })} />
                  </label>
                  {settings.mode === 'sequence' && (
                    <label className="field">
                      <span>Notes per phrase: {settings.sequenceLength}</span>
                      <input type="range" min={2} max={8} value={settings.sequenceLength} onChange={(e) => update({ sequenceLength: Number(e.target.value) })} />
                    </label>
                  )}
                  {settings.mode === 'chord' && (
                    <div className="field">
                      <span>Chord shapes</span>
                      <div className="chips" role="group" aria-label="Chord shapes">
                        {(Object.keys(CHORD_LABELS) as ChordKind[]).map((k) => (
                          <button key={k} type="button" className={`chip${settings.chordKinds.includes(k) ? ' chip--on' : ''}`} onClick={() => update({ chordKinds: toggle(settings.chordKinds, k) })}>
                            {CHORD_LABELS[k]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {settings.mode === 'rhythm' && (
                    <>
                      <label className="field">
                        <span>Tempo: {settings.tempo} bpm</span>
                        <input type="range" min={50} max={120} step={2} value={settings.tempo} onChange={(e) => update({ tempo: Number(e.target.value) })} />
                      </label>
                      <label className="field">
                        <span>Time signature</span>
                        <select value={settings.timeSignature[0]} onChange={(e) => update({ timeSignature: [Number(e.target.value), 4] })}>
                          <option value={4}>4/4</option>
                          <option value={3}>3/4</option>
                          <option value={2}>2/4</option>
                        </select>
                      </label>
                      <div className="field">
                        <span>Note values</span>
                        <div className="chips" role="group" aria-label="Note values">
                          {(Object.keys(DURATION_LABELS) as Duration[]).map((d) => (
                            <button key={d} type="button" className={`chip${settings.durations.includes(d) ? ' chip--on' : ''}`} onClick={() => update({ durations: toggle(settings.durations, d) })}>
                              {DURATION_LABELS[d]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {settings.mode !== 'rhythm' && (
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
                  )}
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
                  Computer keyboard: <kbd>A</kbd>–<kbd>K</kbd> are white keys, <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd> are black keys, <kbd>Z</kbd> / <kbd>X</kbd> change octave.
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
            <button type="button" className="btn btn--primary btn--big" onClick={onStartFree}>
              Start
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

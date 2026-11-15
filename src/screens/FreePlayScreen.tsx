import { useCallback, useMemo, useState } from 'react';
import { synth } from '../audio/synth';
import { usePlayerPiano, type PlayerMode } from '../audio/usePlayerPiano';
import { Piano, type KeyHighlight } from '../components/Piano';
import { Staff, type EventState } from '../components/Staff';
import { useComputerKeyboard } from '../input/useComputerKeyboard';
import { micLabel, useMicInput } from '../input/useMicInput';
import { useMidiInput } from '../input/useMidiInput';
import type { KeyboardSize } from '../music/difficulty';
import { DURATION_BEATS } from '../music/generator';
import { describeKey } from '../music/keys';
import { ceilToB, floorToC, midiToName } from '../music/notes';
import { PIECES } from '../music/pieces';
import { barPrompt, pieceRange, type Piece, type PlayerHands } from '../music/score';

interface FreePlayScreenProps {
  initialPieceId: string | null;
  keyboardSize: KeyboardSize;
  keyLabels: boolean;
  micInput: boolean;
  onToggleMic: () => void;
  onBack: () => void;
}

const KEYBOARD_HEIGHT: Record<KeyboardSize, string> = { small: '30%', medium: '40%', large: '52%' };
const TEMPOS = [0.5, 0.65, 0.8, 1, 1.15, 1.3];

function eventStates(events: { beat: number; duration: keyof typeof DURATION_BEATS; rest: boolean }[], beat: number, playing: boolean, expectedBeat: number | null): EventState[] {
  return events.map((e) => {
    if (e.rest) return 'pending';
    if (expectedBeat !== null) return Math.abs(e.beat - expectedBeat) < 1e-6 ? 'current' : 'pending';
    if (!playing) return 'pending';
    return beat >= e.beat && beat < e.beat + DURATION_BEATS[e.duration] ? 'current' : 'pending';
  });
}

export function FreePlayScreen({ initialPieceId, keyboardSize, keyLabels, micInput, onToggleMic, onBack }: FreePlayScreenProps) {
  const [pieceId, setPieceId] = useState<string>(initialPieceId ?? '');
  const [mode, setMode] = useState<PlayerMode>('listen');
  const [tempoIndex, setTempoIndex] = useState(3);
  const [loop, setLoop] = useState(false);
  const [hands, setHands] = useState<PlayerHands>('right');
  const piece: Piece | null = useMemo(() => PIECES.find((p) => p.id === pieceId) ?? null, [pieceId]);
  const [player, controls] = usePlayerPiano(piece, mode, TEMPOS[tempoIndex], loop, hands);

  const range = useMemo(() => {
    if (!piece) return { low: 36, high: 95 }; // C2..B6
    const r = pieceRange(piece);
    return { low: floorToC(Math.min(r.low, 60)), high: ceilToB(Math.max(r.high, 71)) };
  }, [piece]);

  const handleNoteOn = useCallback(
    (midi: number) => {
      synth.play(midi);
      controls.notePressed(midi);
    },
    [controls],
  );
  useMidiInput((midi) => handleNoteOn(midi));
  const { baseMidi } = useComputerKeyboard(handleNoteOn);
  // A note heard through the microphone already made its own sound: only pass it to the player piano.
  const mic = useMicInput((midi) => controls.notePressed(midi), micInput, range);

  const highlights = useMemo(() => {
    const h: Partial<Record<number, KeyHighlight>> = {};
    for (const m of player.activeBass) h[m] = 'held';
    for (const m of player.activeTreble) h[m] = 'correct';
    for (const m of player.expected) h[m] = 'answer';
    if (mic.note !== null && h[mic.note] === undefined) h[mic.note] = 'pressed';
    return h;
  }, [player.activeBass, player.activeTreble, player.expected, mic.note]);

  const bar = piece ? piece.bars[player.bar] : null;
  const prompt = piece ? barPrompt(piece, player.bar) : null;
  // Read-ahead: the bar that follows, so eyes can move on before the hands do.
  const nextBar = piece ? (player.bar + 1 < piece.bars.length ? player.bar + 1 : loop ? 0 : null) : null;
  const nextPrompt = piece && nextBar !== null ? barPrompt(piece, nextBar) : null;
  const listening = player.playing && mode === 'listen';
  const expectedBeat = mode === 'wait' && player.playing && player.expected.length ? player.beatInBar : null;
  const trebleStates = bar ? eventStates(bar.treble, player.beatInBar, listening, hands !== 'left' ? expectedBeat : null) : [];
  const bassStates = bar ? eventStates(bar.bass, player.beatInBar, listening, hands !== 'right' ? expectedBeat : null) : [];
  const keepVisible = [...player.activeTreble, ...player.activeBass, ...player.expected];

  const status = !piece
    ? 'Pick a piece, or just play.'
    : player.finished
      ? 'The end. Play again?'
      : player.playing
        ? mode === 'wait'
          ? player.expected.length
            ? `Play ${player.expected.map((m) => midiToName(m)).join(' + ')}`
            : 'Listen…'
          : 'Playing'
        : mode === 'wait'
          ? `Press play, then play the highlighted keys. ${hands === 'both' ? 'Both hands are yours.' : `The ${hands === 'right' ? 'left' : 'right'} hand follows you.`}`
          : 'Press play to hear it with the keys lit up.';

  return (
    <div className="screen practice freeplay">
      <header className="hud hud--wrap">
        <button type="button" className="btn btn--ghost" onClick={onBack} aria-label="Back">
          ✕
        </button>
        {piece && (
          <div className="transport">
            {player.playing ? (
              <button type="button" className="btn btn--primary" onClick={controls.pause} aria-label="Pause">
                ❚❚
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={controls.play} aria-label="Play">
                ▶
              </button>
            )}
            <button type="button" className="btn" onClick={controls.stop} aria-label="Stop" disabled={!player.playing && player.beat === 0}>
              ■
            </button>
          </div>
        )}
        <select className="hud__select" value={pieceId} onChange={(e) => setPieceId(e.target.value)} aria-label="Piece">
          <option value="">Just the piano</option>
          {PIECES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        {piece && (
          <>
            <div className="tabs tabs--small" role="radiogroup" aria-label="Player mode">
              <button type="button" role="radio" aria-checked={mode === 'listen'} className={`tab${mode === 'listen' ? ' tab--active' : ''}`} onClick={() => setMode('listen')}>
                Listen
              </button>
              <button type="button" role="radio" aria-checked={mode === 'wait'} className={`tab${mode === 'wait' ? ' tab--active' : ''}`} onClick={() => setMode('wait')}>
                Play along
              </button>
            </div>
            {mode === 'wait' && (
              <select className="hud__select hud__select--small" value={hands} onChange={(e) => setHands(e.target.value as PlayerHands)} aria-label="Hands to play">
                <option value="right">Right hand</option>
                <option value="left">Left hand</option>
                <option value="both">Both hands</option>
              </select>
            )}
            <label className="hud__tempo">
              <span className="muted small">{Math.round(piece.tempo * TEMPOS[tempoIndex])} bpm</span>
              <input type="range" min={0} max={TEMPOS.length - 1} value={tempoIndex} onChange={(e) => setTempoIndex(Number(e.target.value))} aria-label="Tempo" />
            </label>
          </>
        )}
        <span className="hud__hint muted small">Keys from {midiToName(baseMidi)}</span>
      </header>

      <div className="practice__staff freeplay__stage">
        {piece && prompt ? (
          <div className="score">
            <div className="score__now">
              <Staff clefMode="grand" prompt={prompt} states={trebleStates} secondaryStates={bassStates} playheadBeat={listening ? player.beatInBar : expectedBeat} />
            </div>
            <div className="score__next" aria-hidden="true">
              <span className="score__label">{nextPrompt ? 'Next' : 'End'}</span>
              {nextPrompt && <Staff clefMode="grand" prompt={nextPrompt} />}
            </div>
          </div>
        ) : (
          <div className="freeplay__empty">
            <h2>Free play</h2>
            <p className="muted">Every key sounds. Choose a piece above to watch the player piano, or to play along with it.</p>
          </div>
        )}
        <div className="freeplay__bar muted small">
          <span className="freeplay__status">{piece ? [piece.title, piece.keyLabel ?? (piece.key !== 'C' ? describeKey(piece.key) : null), status].filter(Boolean).join(' · ') : status}</span>
          <button type="button" className={`btn btn--ghost mic mic--${mic.state}`} onClick={onToggleMic} aria-pressed={micInput} aria-label="Microphone input" title="Listen for a real piano through the microphone">
            <span aria-hidden="true">🎤</span>
            {micInput && <span className="mic__note">{micLabel(mic, (m) => midiToName(m))}</span>}
          </button>
          {piece && (
            <label className="freeplay__loop">
              <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop
            </label>
          )}
          {piece && (
            <label className="freeplay__seek">
              <input
                type="range"
                min={1}
                max={piece.bars.length}
                value={player.bar + 1}
                onChange={(e) => controls.seek(Number(e.target.value) - 1)}
                aria-label="Bar"
                aria-valuetext={`Bar ${player.bar + 1} of ${piece.bars.length}`}
              />
              <span className="freeplay__barcount">
                Bar {player.bar + 1} / {piece.bars.length}
              </span>
            </label>
          )}
        </div>
      </div>

      <div className="practice__piano" style={{ flexBasis: KEYBOARD_HEIGHT[keyboardSize] }}>
        <Piano low={range.low} high={range.high} onNoteOn={handleNoteOn} highlights={highlights} labelled={keyLabels ? 'all' : undefined} keepVisible={keepVisible} />
      </div>
    </div>
  );
}

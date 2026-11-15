import { useCallback, useEffect, useRef, useState } from 'react';
import { synth } from '../audio/synth';
import { medianOffset } from '../state/judge';

interface CalibrationDialogProps {
  /** Current saved offset in ms, or null when automatic. */
  current: number | null;
  onSave: (offsetMs: number | null) => void;
  onClose: () => void;
}

const BPM = 100;
const CLICKS = 12;
/** The first clicks are for finding the pulse and are not measured. */
const WARM_UP = 4;

type Stage = { name: 'idle' } | { name: 'running'; beat: number } | { name: 'done'; offsetMs: number; spreadMs: number; matched: number } | { name: 'failed' };

/**
 * Tap-along calibration. Twelve clicks play; the player taps with them. The
 * median gap between scheduled click and tap covers everything that sits
 * between the audio clock and the judged input on this device: speaker or
 * Bluetooth delay, touch reporting delay and the player's own habit.
 */
export function CalibrationDialog({ current, onSave, onClose }: CalibrationDialogProps) {
  const [stage, setStage] = useState<Stage>({ name: 'idle' });
  const clicks = useRef<number[]>([]);
  const taps = useRef<number[]>([]);
  const stops = useRef<Array<() => void>>([]);
  const timers = useRef<number[]>([]);
  const running = stage.name === 'running';
  const reported = Math.round(synth.outputLatency() * 1000);

  const cleanup = useCallback(() => {
    stops.current.forEach((stop) => stop());
    timers.current.forEach((t) => window.clearTimeout(t));
    stops.current = [];
    timers.current = [];
  }, []);
  useEffect(() => cleanup, [cleanup]);

  const start = () => {
    cleanup();
    synth.unlock();
    const interval = 60 / BPM;
    const t0 = synth.now() + 0.6;
    clicks.current = Array.from({ length: CLICKS }, (_, i) => t0 + i * interval);
    taps.current = [];
    stops.current = clicks.current.map((t, i) => synth.clickAt(t, i % 4 === 0));
    setStage({ name: 'running', beat: 0 });
    clicks.current.forEach((t, i) => {
      timers.current.push(window.setTimeout(() => setStage({ name: 'running', beat: i + 1 }), Math.max(0, (t - synth.now()) * 1000)));
    });
    timers.current.push(
      window.setTimeout(
        () => {
          const measured = clicks.current.slice(WARM_UP).map((t) => t * 1000);
          const result = medianOffset(
            taps.current.map((t) => t * 1000),
            measured,
          );
          setStage(result ? { name: 'done', ...result } : { name: 'failed' });
        },
        (t0 + CLICKS * interval - synth.now()) * 1000 + 200,
      ),
    );
  };

  const tap = useCallback(() => {
    if (running) taps.current.push(synth.now());
  }, [running]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (running && !e.repeat && (e.key === ' ' || e.key.length === 1)) {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, tap, onClose]);

  return (
    <div className="dialog__backdrop" role="dialog" aria-modal="true" aria-label="Calibrate rhythm timing">
      <div className="dialog">
        <h2 className="dialog__title">Calibrate rhythm timing</h2>
        <p className="muted small">
          Speakers, Bluetooth headphones and touchscreens all add delay. Tap along with twelve clicks and the app will judge your rhythm against what you actually hear.
        </p>

        <button
          type="button"
          className={`tap-pad${running ? ' tap-pad--live' : ''}`}
          disabled={!running}
          onPointerDown={(e) => {
            e.preventDefault();
            tap();
          }}
        >
          {stage.name === 'running' ? (stage.beat <= WARM_UP ? `Listen and join in… ${stage.beat}/${CLICKS}` : `Tap with the click ${stage.beat}/${CLICKS}`) : 'Tap here (or any key) in time with the clicks'}
        </button>

        <p className="dialog__status" role="status">
          {stage.name === 'idle' && (current === null ? `Currently automatic${reported ? `: this device reports ${reported} ms` : ''}.` : `Currently calibrated to ${current} ms.`)}
          {stage.name === 'done' &&
            `Your taps land ${Math.abs(stage.offsetMs)} ms ${stage.offsetMs >= 0 ? 'after' : 'before'} the scheduled click (${stage.matched} taps${stage.spreadMs > 80 ? ', quite uneven: consider trying again' : ''}).`}
          {stage.name === 'failed' && 'Not enough taps landed near the clicks. Try again and tap on each one.'}
        </p>

        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
          {current !== null && (
            <button type="button" className="btn" onClick={() => onSave(null)}>
              Back to automatic
            </button>
          )}
          <button type="button" className="btn" onClick={start} disabled={running}>
            {stage.name === 'idle' ? 'Start' : 'Try again'}
          </button>
          {stage.name === 'done' && (
            <button type="button" className="btn btn--primary" onClick={() => onSave(stage.offsetMs)}>
              Save {stage.offsetMs} ms
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

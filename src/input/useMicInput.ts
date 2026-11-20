import { useEffect, useRef, useState } from 'react';
import { analyseFrame, createNoteTracker, DEFAULT_TRACKER, micSearchRange } from '../audio/pitch';

export type MicState = 'off' | 'starting' | 'listening' | 'denied' | 'missing' | 'unsupported' | 'error';

export interface MicStatus {
  state: MicState;
  /** The note currently heard, if any. */
  note: number | null;
  /** How long after a note is struck it is reported, in ms (0 while not listening). */
  delayMs: number;
}

const FRAME_MS = 33;
const FFT_SIZE = 4096;

/**
 * Roughly how long a note has been sounding by the time it is reported:
 * the frames that must agree plus about half of the analysis window.
 */
export function micDelayMs(sampleRate: number): number {
  return Math.round(DEFAULT_TRACKER.stableFrames * FRAME_MS + (FFT_SIZE / 2 / sampleRate) * 1000);
}

/**
 * Listens to the microphone and reports notes played on a real instrument.
 * One note at a time: chords and pedalled passages are beyond it. The audio is
 * analysed on the device and never recorded or sent anywhere.
 */
export function useMicInput(onNoteOn: (midi: number, delayMs: number) => void, enabled: boolean, range?: { low: number; high: number }): MicStatus {
  const handler = useRef(onNoteOn);
  handler.current = onNoteOn;
  const low = range?.low ?? 36;
  const high = range?.high ?? 96;
  const [status, setStatus] = useState<MicStatus>({ state: 'off', note: null, delayMs: 0 });

  useEffect(() => {
    if (!enabled) {
      setStatus({ state: 'off', note: null, delayMs: 0 });
      return;
    }
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !AudioCtor) {
      setStatus({ state: 'unsupported', note: null, delayMs: 0 });
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer: number | undefined;
    setStatus({ state: 'starting', note: null, delayMs: 0 });

    navigator.mediaDevices
      // Processing meant for speech smears or gates musical notes, so it is switched off.
      .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        ctx = new AudioCtor();
        void ctx.resume();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0;
        ctx.createMediaStreamSource(s).connect(analyser);
        const buf = new Float32Array(FFT_SIZE);
        const tracker = createNoteTracker();
        const delay = micDelayMs(ctx.sampleRate);
        const hop = Math.round((FRAME_MS / 1000) * ctx.sampleRate);
        const { minFreq, maxFreq, lowest, highest } = micSearchRange(low, high);
        let shown: number | null = null;
        setStatus({ state: 'listening', note: null, delayMs: delay });

        timer = window.setInterval(() => {
          if (!ctx) return;
          analyser.getFloatTimeDomainData(buf);
          const frame = analyseFrame(buf, ctx.sampleRate, minFreq, maxFreq, hop);
          const inRange = frame.midi !== null && frame.midi >= lowest && frame.midi <= highest;
          const on = tracker.push(inRange ? frame : { ...frame, midi: null });
          if (on !== null) handler.current(on, delay);
          if (tracker.current !== shown) {
            shown = tracker.current;
            setStatus({ state: 'listening', note: shown, delayMs: delay });
          }
        }, FRAME_MS);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        const state: MicState = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'error';
        setStatus({ state, note: null, delayMs: 0 });
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [enabled, low, high]);

  return status;
}

/** Short text for the mic button and status line. */
export function micLabel(status: MicStatus, name: (midi: number) => string): string {
  switch (status.state) {
    case 'off':
      return 'Mic off';
    case 'starting':
      return 'Mic starting…';
    case 'listening':
      return status.note !== null ? `Hearing ${name(status.note)}` : 'Listening';
    case 'denied':
      return 'Mic blocked: allow it in settings';
    case 'missing':
      return 'No microphone found';
    case 'unsupported':
      return 'No mic support';
    default:
      return 'Mic error';
  }
}

/**
 * The accessible name of the microphone switch. The switch shows its state as text inside the
 * button, which a screen reader would never read once the button has a fixed label, so the state
 * goes into the label. The heard note is left out: it changes several times a second.
 */
export function micButtonLabel(on: boolean, status: MicStatus): string {
  if (!on || status.state === 'off') return 'Microphone input';
  if (status.state === 'listening') return 'Microphone input: listening';
  return `Microphone input: ${micLabel(status, String)}`;
}

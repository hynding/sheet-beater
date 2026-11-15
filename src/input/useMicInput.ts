import { useEffect, useRef, useState } from 'react';
import { analyseFrame, createNoteTracker, DEFAULT_TRACKER } from '../audio/pitch';
import { midiToFrequency } from '../music/notes';

export type MicState = 'off' | 'starting' | 'listening' | 'denied' | 'missing' | 'unsupported' | 'error';

export interface MicStatus {
  state: MicState;
  /** The note currently heard, if any. */
  note: number | null;
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
  const [status, setStatus] = useState<MicStatus>({ state: 'off', note: null });

  useEffect(() => {
    if (!enabled) {
      setStatus({ state: 'off', note: null });
      return;
    }
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !AudioCtor) {
      setStatus({ state: 'unsupported', note: null });
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer: number | undefined;
    setStatus({ state: 'starting', note: null });

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
        // Search a little beyond the keyboard so a neighbouring wrong note is still heard as itself.
        const minFreq = midiToFrequency(low - 2);
        const maxFreq = midiToFrequency(high + 2);
        let shown: number | null = null;
        setStatus({ state: 'listening', note: null });

        timer = window.setInterval(() => {
          if (!ctx) return;
          analyser.getFloatTimeDomainData(buf);
          const frame = analyseFrame(buf, ctx.sampleRate, minFreq, maxFreq);
          const inRange = frame.midi !== null && frame.midi >= low - 1 && frame.midi <= high + 1;
          const on = tracker.push(inRange ? frame : { midi: null, rms: frame.rms });
          if (on !== null) handler.current(on, delay);
          if (tracker.current !== shown) {
            shown = tracker.current;
            setStatus({ state: 'listening', note: shown });
          }
        }, FRAME_MS);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        const state: MicState = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'error';
        setStatus({ state, note: null });
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

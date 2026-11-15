/**
 * Monophonic pitch detection for microphone input: the YIN estimator plus a
 * small tracker that turns a stream of per-frame estimates into note onsets.
 * Everything here is pure so it can be tested with synthesized audio.
 */

export interface PitchEstimate {
  freq: number;
  /** 0..1; how periodic the signal is at the detected period. */
  clarity: number;
}

/** Root mean square level of a buffer (0..1 for full-scale audio). */
export function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / Math.max(1, buf.length));
}

const YIN_THRESHOLD = 0.15;
const YIN_FALLBACK = 0.3;
const MAX_WINDOW = 2048;

/**
 * Estimates the fundamental frequency of `buf`, or null when the signal is
 * not clearly pitched within [minFreq, maxFreq]. YIN compares the signal with
 * itself shifted by every candidate period and picks the first shift where
 * the two nearly cancel, which finds the fundamental even when (as on a
 * piano's low strings) an overtone is louder than it.
 */
export function detectPitch(buf: Float32Array, sampleRate: number, minFreq = 60, maxFreq = 2200): PitchEstimate | null {
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
  const window = Math.min(MAX_WINDOW, buf.length - tauMax);
  if (tauMax <= tauMin || window < tauMin * 2) return null;

  // Cumulative-mean-normalized difference function.
  const d = new Float32Array(tauMax + 1);
  let running = 0;
  d[0] = 1;
  let tau = -1;
  let best = -1;
  for (let t = 1; t <= tauMax; t++) {
    let sum = 0;
    for (let j = 0; j < window; j++) {
      const diff = buf[j] - buf[j + t];
      sum += diff * diff;
    }
    running += sum;
    d[t] = running > 0 ? (sum * t) / running : 1;
    if (t < tauMin) continue;
    if (best === -1 || d[t] < d[best]) best = t;
    if (tau === -1 && d[t] < YIN_THRESHOLD) {
      // First dip under the threshold: follow it down to its local minimum.
      tau = t;
    } else if (tau !== -1) {
      if (d[t] < d[tau] && t === tau + 1) tau = t;
      else break;
    }
  }
  if (tau === -1) {
    if (best === -1 || d[best] > YIN_FALLBACK) return null;
    tau = best;
  }

  // Parabolic interpolation around the minimum for sub-sample precision.
  let refined = tau;
  if (tau > 1 && tau < tauMax) {
    const a = d[tau - 1];
    const b = d[tau];
    const c = d[tau + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) refined = tau + (a - c) / (2 * denom);
  }
  return { freq: sampleRate / refined, clarity: Math.max(0, Math.min(1, 1 - d[tau])) };
}

/** Nearest MIDI note and how far off it is, in cents. */
export function freqToMidi(freq: number): { midi: number; cents: number } {
  const exact = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}

export interface Frame {
  /** Detected MIDI note for this frame, or null when nothing pitched was heard. */
  midi: number | null;
  rms: number;
}

export interface TrackerOptions {
  /** Consecutive frames that must agree before a note counts. */
  stableFrames: number;
  /** Level below which a frame is treated as silence. */
  minRms: number;
  /** Silent frames before the current note is considered released. */
  releaseFrames: number;
  /** A held note sounding again this many times louder than its quietest point is a new strike. */
  reattackRatio: number;
  /** Frames after an onset during which the same note cannot fire again (its level is still rising). */
  refractoryFrames: number;
}

export const DEFAULT_TRACKER: TrackerOptions = { stableFrames: 3, minRms: 0.01, releaseFrames: 2, reattackRatio: 1.8, refractoryFrames: 4 };

/**
 * Turns frames into note-on events. A note fires once when it has been heard
 * steadily. The same note fires again only when it is clearly struck again:
 * its level jumps well above the quietest point since the last strike, where
 * a gap (however short) counts as quiet. A different note fires as soon as
 * it is steady.
 */
export function createNoteTracker(options: Partial<TrackerOptions> = {}) {
  const o = { ...DEFAULT_TRACKER, ...options };
  let candidate: number | null = null;
  let run = 0;
  let active: number | null = null;
  let silent = 0;
  let quietest = Infinity;
  let sinceOnset = Infinity;

  const fire = (midi: number, level: number) => {
    active = midi;
    quietest = level;
    sinceOnset = 0;
    return midi;
  };

  return {
    /** The note currently sounding, if any. */
    get current(): number | null {
      return active;
    },
    /** Feed one frame; returns a MIDI note when a new note starts. */
    push(frame: Frame): number | null {
      sinceOnset++;
      const midi = frame.rms >= o.minRms ? frame.midi : null;
      if (midi === null) {
        candidate = null;
        run = 0;
        // A gap, even one frame long, lowers the floor a re-strike is measured from.
        quietest = Math.min(quietest, frame.rms);
        if (++silent >= o.releaseFrames) active = null;
        return null;
      }
      silent = 0;
      if (midi === candidate) run++;
      else {
        candidate = midi;
        run = 1;
      }
      if (midi !== active) return run >= o.stableFrames ? fire(midi, frame.rms) : null;
      // Same note as the one sounding.
      if (sinceOnset < o.refractoryFrames) {
        // The analysis window is still filling with the new strike: follow the level up.
        quietest = frame.rms;
        return null;
      }
      if (run >= o.stableFrames && frame.rms > quietest * o.reattackRatio) return fire(midi, frame.rms);
      quietest = Math.min(quietest, frame.rms);
      return null;
    },
    reset() {
      candidate = null;
      run = 0;
      active = null;
      silent = 0;
      quietest = Infinity;
      sinceOnset = Infinity;
    },
  };
}

/** How close to a semitone a pitch must be to count, in cents. */
export const MAX_CENTS = 35;
/** Clarity below this is treated as noise. */
export const MIN_CLARITY = 0.8;

/** One analysis step: buffer in, frame out. */
export function analyseFrame(buf: Float32Array, sampleRate: number, minFreq: number, maxFreq: number): Frame {
  const level = rms(buf);
  if (level < DEFAULT_TRACKER.minRms) return { midi: null, rms: level };
  const estimate = detectPitch(buf, sampleRate, minFreq, maxFreq);
  if (!estimate || estimate.clarity < MIN_CLARITY) return { midi: null, rms: level };
  const { midi, cents } = freqToMidi(estimate.freq);
  return { midi: Math.abs(cents) <= MAX_CENTS ? midi : null, rms: level };
}

/** Highest frequency searched: above the top key of a piano (C8 is 4186 Hz). */
export const MAX_SEARCH_HZ = 4400;

/**
 * What to listen for, given the keyboard on screen. The search always runs to
 * the top of the piano: if it stopped just above the keyboard, a note played
 * an octave too high would be heard as its lower octave and marked correct.
 * Notes up to an octave outside the keyboard are reported (they are wrong
 * answers worth showing); anything further out is ignored as stray sound.
 */
export function micSearchRange(low: number, high: number): { minFreq: number; maxFreq: number; lowest: number; highest: number } {
  const lowest = low - 12;
  const highest = high + 12;
  return { minFreq: 440 * Math.pow(2, (lowest - 1 - 69) / 12), maxFreq: MAX_SEARCH_HZ, lowest, highest };
}

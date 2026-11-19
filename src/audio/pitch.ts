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
  /** How cleanly periodic the frame is at the detected pitch (0..1). */
  clarity?: number;
  /**
   * Peak amplitude of each half of the newest hop of audio (about 16 ms
   * each), oldest first. Much finer in time than `rms`, which averages the
   * whole analysis window: a damper gap of 40 ms shows up here and not there.
   */
  peaks?: [number, number];
}

export interface TrackerOptions {
  /** Consecutive frames that must agree before a note counts. */
  stableFrames: number;
  /** Level below which a frame is always treated as silence, however quiet the room. */
  minRms: number;
  /** A frame must be this many times louder than the room's background level to count. */
  gateRatio: number;
  /** Silent frames before the current note is considered released. */
  releaseFrames: number;
  /** Level rise within about 100 ms that a hammer strike produces. */
  attackRatio: number;
  /** A strike on a ringing note lifts the level this far above where it had decayed to. */
  exceedRatio: number;
  /** After the level has fallen below `dipRatio` of the note's level (a damper), a rise back to `recoverRatio` is a strike. */
  dipRatio: number;
  recoverRatio: number;
  /** Per-frame decay of the remembered level of the sounding note. */
  envelopeDecay: number;
  /** Frames after an onset during which the same note cannot fire again. */
  refractoryFrames: number;
  /** Frames for which a detected strike stays available to the note that follows it. */
  attackMemoryFrames: number;
  /** Clarity a frame needs to count as a clean reading of its pitch. */
  cleanClarity: number;
  /** Extra clean frames demanded of an unstruck note that could be an overtone of the last one. */
  overtoneExtraFrames: number;
  /** An unstruck, unclean change to an unrelated note is accepted once it has lasted this many extra frames. */
  patienceFrames: number;
}

export const DEFAULT_TRACKER: TrackerOptions = {
  stableFrames: 3,
  minRms: 0.002,
  gateRatio: 3,
  releaseFrames: 3,
  attackRatio: 1.6,
  exceedRatio: 1.15,
  dipRatio: 0.2,
  recoverRatio: 0.6,
  envelopeDecay: 0.99,
  refractoryFrames: 4,
  attackMemoryFrames: 8,
  cleanClarity: 0.93,
  overtoneExtraFrames: 3,
  patienceFrames: 5,
};

/** Overtones a ringing string can momentarily read as: octave, twelfth, two octaves and beyond. */
const HARMONIC_STEPS = new Set([12, 19, 24, 28, 31]);

/**
 * Turns frames into note-on events. The rules come from how real pianos
 * behave in recordings, not from idealised tones:
 *
 * - Loudness varies enormously between rooms, pianos and microphones, so the
 *   level gate follows the background level instead of being a fixed number.
 * - A held note does not fade smoothly. Its strings beat against each other
 *   and the level swells and dips for seconds. The same key only counts as
 *   played again after a strike: a fast rise that either lifts the level
 *   clearly above where the note had decayed to, or brings it back after the
 *   damper had all but silenced it.
 * - When a key is struck the analysis window still holds mostly the old note
 *   for a moment, so after any strike the pitch has to settle again before
 *   anything fires. Otherwise the strike is credited to the note it ended.
 * - A ringing note can briefly read as something else with no strike: one of
 *   its overtones (usually the octave), or on low strings an unrelated pitch.
 *   Those readings are less cleanly periodic than a real note. So a change
 *   of pitch that comes without a strike has to be clean, and an
 *   overtone-related one clean for longer; an unclean change to an unrelated
 *   note is accepted only once it has clearly lasted.
 */
export function createNoteTracker(options: Partial<TrackerOptions> = {}) {
  const o = { ...DEFAULT_TRACKER, ...options };
  let candidate: number | null = null;
  let run = 0;
  let cleanRun = 0;
  let active: number | null = null;
  let last: number | null = null;
  let silent = 0;
  let sinceOnset = Infinity;
  let sinceAttack = Infinity;
  let floor: number | null = null;
  let sounding = false;
  let recent: number[] = [];
  let envelope = 0;
  // The fine envelope arrives two values per frame; keep about 100 ms of it either way.
  let history = 3;
  let decay = o.envelopeDecay;

  const fire = (midi: number, level: number) => {
    active = midi;
    last = midi;
    sinceOnset = 0;
    sinceAttack = Infinity;
    envelope = level;
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
      sinceAttack++;
      const perFrame = frame.peaks ? frame.peaks.length : 1;
      history = 3 * perFrame;
      decay = Math.pow(o.envelopeDecay, 1 / perFrame);
      // Background level: drops at once to any quieter frame, creeps back up slowly.
      floor = floor === null ? Math.min(frame.rms, 0.01) : Math.min(frame.rms, floor * 1.005 + 1e-7);
      const open = Math.max(o.minRms, floor * o.gateRatio);
      // Once a note is sounding it may decay a little below the level that opened the gate.
      const heard = frame.rms >= (sounding ? open * 0.6 : open);
      sounding = heard;

      // Strike detection, on the fine-grained peak envelope where there is one.
      let strike = false;
      for (const peak of frame.peaks ?? [frame.rms]) {
        const low = recent.length ? Math.min(...recent) : peak;
        recent.push(peak);
        if (recent.length > history) recent.shift();
        if (sinceOnset < o.refractoryFrames) {
          // The note that just fired is still building up: follow its level.
          envelope = Math.max(envelope, peak);
          continue;
        }
        const fastRise = peak > low * o.attackRatio;
        const strong = peak > envelope * o.exceedRatio || (low < envelope * o.dipRatio && peak > envelope * o.recoverRatio);
        if (heard && fastRise && strong) {
          strike = true;
          envelope = peak;
          recent = [peak]; // the quiet moment before the strike must not trigger it again
        } else {
          envelope = Math.max(peak, envelope * decay);
        }
      }
      if (strike) {
        sinceAttack = 0;
        run = 0; // the pitch has to settle again after a strike
        cleanRun = 0;
        candidate = null;
      }

      const midi = heard ? frame.midi : null;
      if (midi === null) {
        candidate = null;
        run = 0;
        cleanRun = 0;
        if (++silent >= o.releaseFrames) active = null;
        return null;
      }
      silent = 0;
      if (midi === candidate) run++;
      else {
        candidate = midi;
        run = 1;
        cleanRun = 0;
      }
      cleanRun = (frame.clarity ?? 1) >= o.cleanClarity ? cleanRun + 1 : 0;
      if (run < o.stableFrames) return null;

      const struck = sinceAttack <= o.attackMemoryFrames;
      const level = frame.peaks ? Math.max(...frame.peaks) : frame.rms;
      if (last === null) return fire(midi, level);
      if (midi === last) {
        if (struck && sinceOnset >= o.refractoryFrames) return fire(midi, level);
        active = midi; // still (or again) the same note ringing
        return null;
      }
      if (!struck) {
        const overtone = HARMONIC_STEPS.has(Math.abs(midi - last));
        const clean = cleanRun >= o.stableFrames + (overtone ? o.overtoneExtraFrames : 0);
        const lasting = !overtone && run >= o.stableFrames + o.patienceFrames;
        if (!clean && !lasting) return null;
      }
      return fire(midi, level);
    },
    reset() {
      candidate = null;
      run = 0;
      cleanRun = 0;
      active = null;
      last = null;
      silent = 0;
      sinceOnset = Infinity;
      sinceAttack = Infinity;
      floor = null;
      sounding = false;
      recent = [];
      envelope = 0;
    },
  };
}

/** How close to a semitone a pitch must be to count, in cents. */
export const MAX_CENTS = 35;
/** Clarity below this is treated as noise. */
export const MIN_CLARITY = 0.8;

/** Peak amplitude of each half of the newest `hop` samples of a buffer. */
export function hopPeaks(buf: Float32Array, hop: number): [number, number] {
  const half = Math.max(1, Math.floor(Math.min(hop, buf.length) / 2));
  const peak = (from: number, to: number) => {
    let p = 0;
    for (let i = Math.max(0, from); i < to; i++) p = Math.max(p, Math.abs(buf[i]));
    return p;
  };
  return [peak(buf.length - 2 * half, buf.length - half), peak(buf.length - half, buf.length)];
}

/**
 * One analysis step: buffer in, frame out. `hop` is how many samples are new
 * since the previous call; with it the frame also carries the fine peak
 * envelope the tracker uses to spot strikes.
 */
export function analyseFrame(buf: Float32Array, sampleRate: number, minFreq: number, maxFreq: number, hop?: number): Frame {
  const level = rms(buf);
  const peaks = hop ? hopPeaks(buf, hop) : undefined;
  // Below this there is nothing to analyse; the tracker applies the real, room-dependent gate.
  if (level < DEFAULT_TRACKER.minRms * 0.5) return { midi: null, rms: level, peaks };
  const estimate = detectPitch(buf, sampleRate, minFreq, maxFreq);
  if (!estimate || estimate.clarity < MIN_CLARITY) return { midi: null, rms: level, peaks };
  const { midi, cents } = freqToMidi(estimate.freq);
  return { midi: Math.abs(cents) <= MAX_CENTS ? midi : null, rms: level, clarity: estimate.clarity, peaks };
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

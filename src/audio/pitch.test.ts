import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../music/notes';
import { analyseFrame, createNoteTracker, detectPitch, freqToMidi, micSearchRange, rms } from './pitch';

const SR = 48000;

/** A piano-like tone: decaying harmonics, optionally with a weak fundamental and background noise. */
function tone(freq: number, opts: { length?: number; harmonics?: number[]; noise?: number; sampleRate?: number; amp?: number } = {}): Float32Array {
  const { length = 4096, harmonics = [1, 0.6, 0.4, 0.25, 0.15], noise = 0, sampleRate = SR, amp = 0.3 } = opts;
  const out = new Float32Array(length);
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000) * 2 - 1;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let v = 0;
    harmonics.forEach((h, k) => {
      if ((k + 1) * freq < sampleRate / 2) v += h * Math.sin(2 * Math.PI * (k + 1) * freq * t + k);
    });
    out[i] = amp * v * Math.exp(-t * 2) + noise * rand();
  }
  return out;
}

describe('detectPitch', () => {
  it('finds every note from C2 to C7 at 48 kHz and 44.1 kHz', () => {
    for (const sampleRate of [48000, 44100]) {
      for (let midi = 36; midi <= 96; midi++) {
        const est = detectPitch(tone(midiToFrequency(midi), { sampleRate }), sampleRate);
        expect(est, `midi ${midi} @ ${sampleRate}`).not.toBeNull();
        const got = freqToMidi(est!.freq);
        expect(got.midi, `midi ${midi} @ ${sampleRate}`).toBe(midi);
        expect(Math.abs(got.cents)).toBeLessThan(15);
      }
    }
  });

  it('is not fooled by a weak fundamental or by noise', () => {
    // Low piano strings: second and third harmonics louder than the fundamental.
    for (const midi of [36, 40, 45, 52]) {
      const est = detectPitch(tone(midiToFrequency(midi), { harmonics: [0.3, 1, 0.8, 0.5, 0.3, 0.2] }), SR);
      expect(freqToMidi(est!.freq).midi).toBe(midi);
    }
    const noisy = detectPitch(tone(midiToFrequency(64), { noise: 0.03 }), SR);
    expect(freqToMidi(noisy!.freq).midi).toBe(64);
  });

  it('returns nothing for noise or out-of-range pitches', () => {
    expect(detectPitch(tone(440, { harmonics: [], noise: 0.2 }), SR)).toBeNull();
    expect(detectPitch(new Float32Array(4096), SR)).toBeNull();
    expect(detectPitch(tone(midiToFrequency(40)), SR, 200, 1200)).toBeNull(); // E2 with the search limited to G3 and up
  });

  it('measures level', () => {
    expect(rms(new Float32Array(100))).toBe(0);
    expect(rms(new Float32Array(100).fill(0.5))).toBeCloseTo(0.5);
  });
});

describe('analyseFrame', () => {
  it('reports in-tune notes and rejects quarter tones, quiet input and noise', () => {
    expect(analyseFrame(tone(midiToFrequency(60)), SR, 60, 2200).midi).toBe(60);
    const between = midiToFrequency(60) * Math.pow(2, 0.5 / 12);
    expect(analyseFrame(tone(between), SR, 60, 2200).midi).toBeNull();
    expect(analyseFrame(tone(midiToFrequency(60), { amp: 0.002 }), SR, 60, 2200).midi).toBeNull();
    expect(analyseFrame(tone(300, { harmonics: [], noise: 0.3 }), SR, 60, 2200).midi).toBeNull();
  });

  it('ignores the metronome clicks, which sit between semitones', () => {
    for (const clickFreq of [1077, 1614]) {
      const square = new Float32Array(4096);
      for (let i = 0; i < square.length; i++) square[i] = 0.3 * Math.sign(Math.sin((2 * Math.PI * clickFreq * i) / SR));
      expect(analyseFrame(square, SR, 60, 2200).midi).toBeNull();
    }
  });
});

describe('note tracker', () => {
  const f = (midi: number | null, level = 0.1) => ({ midi, rms: level });
  const fired = (frames: Array<{ midi: number | null; rms: number }>, t = createNoteTracker()) => frames.map((x) => t.push(x)).filter((x) => x !== null);

  it('fires once per steadily heard note', () => {
    const t = createNoteTracker();
    const out = [f(60), f(60), f(60), f(60), f(60), f(62), f(62), f(62), f(62)].map((x) => t.push(x));
    expect(out).toEqual([null, null, 60, null, null, null, null, 62, null]);
    expect(t.current).toBe(62);
  });

  it('ignores blips and wobble between notes', () => {
    const t = createNoteTracker();
    const out = [f(60), f(72), f(60), f(60), f(48), f(60), f(60), f(60)].map((x) => t.push(x));
    expect(out).toEqual([null, null, null, null, null, null, null, 60]);
  });

  it('fires once while the level is still rising after the onset', () => {
    expect(fired([f(60, 0.03), f(60, 0.08), f(60, 0.15), f(60, 0.2), f(60, 0.22), f(60, 0.2), f(60, 0.17), f(60, 0.15)])).toEqual([60]);
  });

  it('does not fire again while a note rings or swells slightly', () => {
    expect(fired([f(60, 0.2), f(60, 0.2), f(60, 0.2), f(60, 0.15), f(60, 0.1), f(60, 0.07), f(60, 0.09), f(60, 0.1), f(60, 0.08)])).toEqual([60]);
  });

  it('hears the same key struck again after a gap of any length', () => {
    for (const gap of [1, 2, 5]) {
      const frames = [f(60, 0.2), f(60, 0.2), f(60, 0.2), f(60, 0.15), f(60, 0.12), ...Array.from({ length: gap }, () => f(null, 0.002)), f(60, 0.2), f(60, 0.2), f(60, 0.2), f(60, 0.18)];
      expect(fired(frames), `gap of ${gap} frame(s)`).toEqual([60, 60]);
    }
  });

  it('hears an undamped re-strike exactly once', () => {
    const frames = [0.2, 0.2, 0.2, 0.18, 0.15, 0.12, 0.1, 0.09, 0.14, 0.2, 0.22, 0.2, 0.18, 0.16, 0.14].map((l) => f(60, l));
    expect(fired(frames)).toEqual([60, 60]);
  });

  it('treats quiet frames as silence', () => {
    expect(fired([f(60, 0.001), f(60, 0.001), f(60, 0.001), f(60, 0.001)])).toEqual([]);
  });
});

/** Two strikes of the same note with a damped gap between them, as one long signal. */
function twoStrikes(freq: number, gapSec: number, firstSec = 0.4, secondSec = 0.5): Float32Array {
  const strike = (sec: number) => {
    const n = Math.round(sec * SR);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let v = 0;
      [1, 0.55, 0.35, 0.2].forEach((h, k) => (v += h * Math.sin(2 * Math.PI * (k + 1) * freq * t)));
      const release = Math.min(1, (sec - t) / 0.01); // the damper stops the string quickly
      out[i] = 0.14 * Math.min(1, t / 0.008) * Math.exp(-t * 3.5) * release * v;
    }
    return out;
  };
  const lead = new Float32Array(Math.round(0.15 * SR));
  const gap = new Float32Array(Math.round(gapSec * SR));
  const tail = new Float32Array(Math.round(0.3 * SR));
  const parts = [lead, strike(firstSec), gap, strike(secondSec), tail];
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('repeated notes through the whole analysis chain', () => {
  const HOP = Math.round(0.033 * SR);
  const WINDOW = 4096;
  const { minFreq, maxFreq } = micSearchRange(60, 83);

  it('reports a re-struck key once per strike, whatever the gap and frame alignment', () => {
    for (const gapSec of [0.03, 0.06, 0.1, 0.3]) {
      const signal = twoStrikes(midiToFrequency(67), gapSec);
      for (let offset = 0; offset < HOP; offset += Math.round(HOP / 11)) {
        const tracker = createNoteTracker();
        const onsets: number[] = [];
        for (let end = WINDOW + offset; end <= signal.length; end += HOP) {
          const on = tracker.push(analyseFrame(signal.subarray(end - WINDOW, end), SR, minFreq, maxFreq));
          if (on !== null) onsets.push(on);
        }
        expect(onsets, `gap ${gapSec * 1000} ms, offset ${offset}`).toEqual([67, 67]);
      }
    }
  });
});

describe('micSearchRange', () => {
  it('hears a note played an octave too high as itself, not as the prompt', () => {
    const { minFreq, maxFreq, lowest, highest } = micSearchRange(60, 83); // Beginner keyboard, C4 to B5
    expect(analyseFrame(tone(midiToFrequency(88)), SR, minFreq, maxFreq).midi).toBe(88); // E6, not E5
    expect(analyseFrame(tone(midiToFrequency(100)), SR, minFreq, maxFreq).midi).toBe(100);
    expect(analyseFrame(tone(midiToFrequency(52)), SR, minFreq, maxFreq).midi).toBe(52); // E3, an octave low
    expect([lowest, highest]).toEqual([48, 95]);
    expect(maxFreq).toBeGreaterThan(midiToFrequency(108));
  });
});

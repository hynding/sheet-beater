import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../music/notes';
import { analyseFrame, createNoteTracker, detectPitch, freqToMidi, rms } from './pitch';

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

  it('fires the same note again after silence or a clear re-strike, but not while it rings', () => {
    const t = createNoteTracker();
    const ring = [f(60, 0.2), f(60, 0.2), f(60, 0.2), f(60, 0.15), f(60, 0.1), f(60, 0.07)];
    expect(ring.map((x) => t.push(x)).filter((x) => x !== null)).toEqual([60]);
    // struck again while still sounding: level jumps well above its quietest point
    expect([f(60, 0.2), f(60, 0.2)].map((x) => t.push(x)).filter((x) => x !== null)).toEqual([60]);
    // decays, a small swell is not a strike
    expect([f(60, 0.1), f(60, 0.12), f(60, 0.11)].map((x) => t.push(x)).filter((x) => x !== null)).toEqual([]);
    // silence, then the same note
    const again = [f(null, 0), f(null, 0), f(null, 0), f(60), f(60), f(60)].map((x) => t.push(x));
    expect(again.filter((x) => x !== null)).toEqual([60]);
  });

  it('treats quiet frames as silence', () => {
    const t = createNoteTracker();
    expect([f(60, 0.001), f(60, 0.001), f(60, 0.001), f(60, 0.001)].map((x) => t.push(x)).every((x) => x === null)).toBe(true);
  });
});

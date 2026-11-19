import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../music/notes';
import realPiano from './fixtures/real-piano-frames.json';
import { analyseFrame, createNoteTracker, detectPitch, freqToMidi, hopPeaks, micSearchRange, rms } from './pitch';

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
    expect(analyseFrame(tone(midiToFrequency(60), { amp: 0.0005 }), SR, 60, 2200).midi).toBeNull(); // near silence
    expect(analyseFrame(tone(midiToFrequency(60), { amp: 0.01 }), SR, 60, 2200).midi).toBe(60); // quiet playing is the tracker's call
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
  const f = (midi: number | null, level = 0.1, clarity = 0.99) => ({ midi, rms: level, clarity });
  const fired = (frames: Array<{ midi: number | null; rms: number; clarity?: number }>, t = createNoteTracker()) => frames.map((x) => t.push(x)).filter((x) => x !== null);

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

  it('does not fire again while a note rings, swells or beats', () => {
    expect(fired([f(60, 0.2), f(60, 0.2), f(60, 0.2), f(60, 0.15), f(60, 0.1), f(60, 0.07), f(60, 0.09), f(60, 0.1), f(60, 0.08)])).toEqual([60]);
    // Beating: the level drops to 40% and comes back, again and again, without passing its earlier peaks.
    const beating = Array.from({ length: 60 }, (_, i) => f(60, 0.2 * Math.exp(-i / 60) * (0.7 + 0.3 * Math.cos(i / 2.5))));
    expect(fired(beating)).toEqual([60]);
  });

  it('hears the same key struck again after a gap of any length', () => {
    for (const gap of [1, 2, 5]) {
      const frames = [f(60, 0.2), f(60, 0.2), f(60, 0.2), f(60, 0.15), f(60, 0.12), ...Array.from({ length: gap }, () => f(null, 0.002)), f(60, 0.2), f(60, 0.2), f(60, 0.2), f(60, 0.18)];
      expect(fired(frames), `gap of ${gap} frame(s)`).toEqual([60, 60]);
    }
  });

  it('hears a re-strike on a ringing note exactly once', () => {
    const frames = [0.2, 0.2, 0.2, 0.18, 0.15, 0.12, 0.1, 0.09, 0.16, 0.27, 0.28, 0.26, 0.23, 0.2, 0.18].map((l) => f(60, l));
    expect(fired(frames)).toEqual([60, 60]);
  });

  it('credits a strike to the note that follows it, not the one it ended', () => {
    // A new key is struck (level jumps) but the window still reads the old note for two frames.
    const frames = [f(60, 0.1), f(60, 0.1), f(60, 0.1), f(60, 0.08), f(60, 0.07), f(60, 0.06), f(60, 0.14), f(60, 0.16), f(62, 0.16), f(62, 0.15), f(62, 0.14), f(62, 0.13)];
    expect(fired(frames)).toEqual([60, 62]);
  });

  it('ignores an unclean flip to an unrelated pitch unless it lasts', () => {
    const ringing = [f(36, 0.2, 0.92), f(36, 0.2, 0.92), f(36, 0.2, 0.92), f(36, 0.18, 0.92), f(36, 0.16, 0.92), f(36, 0.15, 0.92)];
    const stray = (n: number) => Array.from({ length: n }, () => f(58, 0.14, 0.86));
    expect(fired([...ringing, ...stray(3), f(36, 0.13, 0.92), f(36, 0.13, 0.92), f(36, 0.13, 0.92)])).toEqual([36]);
    expect(fired([...ringing, ...stray(9)])).toEqual([36, 58]);
    // A clean change of pitch needs no strike: legato at an even level.
    expect(fired([...ringing, f(40, 0.14, 0.97), f(40, 0.14, 0.97), f(40, 0.14, 0.97)])).toEqual([36, 40]);
  });

  it('ignores a brief flip to an overtone but hears a real octave leap', () => {
    const ringing = [f(48, 0.2), f(48, 0.2), f(48, 0.2), f(48, 0.18), f(48, 0.16), f(48, 0.15)];
    const flip = Array.from({ length: 5 }, (_, i) => f(60, 0.14 - i * 0.004, 0.86)); // unclear, no strike
    expect(fired([...ringing, ...flip, f(48, 0.11), f(48, 0.1), f(48, 0.1)])).toEqual([48]);
    const leap = Array.from({ length: 8 }, (_, i) => f(60, 0.14 - i * 0.004, 0.98)); // clean and lasting
    expect(fired([...ringing, ...leap])).toEqual([48, 60]);
  });

  it('follows the room: quiet playing is heard in a quiet room, and noise is gated in a loud one', () => {
    expect(fired([f(null, 0.0004), f(null, 0.0004), f(60, 0.004), f(60, 0.004), f(60, 0.004)])).toEqual([60]);
    const loudRoom = Array.from({ length: 6 }, () => f(null, 0.004));
    expect(fired([...loudRoom, f(60, 0.006), f(60, 0.006), f(60, 0.006), f(60, 0.006)])).toEqual([]);
    expect(fired([...loudRoom, f(60, 0.03), f(60, 0.03), f(60, 0.03)])).toEqual([60]);
    expect(fired([f(60, 0.001), f(60, 0.001), f(60, 0.001), f(60, 0.001)])).toEqual([]);
  });
});

describe('note tracker on real piano recordings', () => {
  // Frame traces measured from recordings of a Steinway and a Yamaha grand; see the fixture's "about".
  for (const fixture of realPiano.fixtures) {
    it(fixture.name, () => {
      const tracker = createNoteTracker();
      const heard: number[] = [];
      for (const [midi, level, clarity, p0, p1] of fixture.frames as Array<[number | null, number, number, number, number]>) {
        const on = tracker.push({ midi, rms: level, clarity, peaks: [p0, p1] });
        if (on !== null) heard.push(on);
      }
      expect(heard).toEqual(fixture.want);
    });
  }
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
          const on = tracker.push(analyseFrame(signal.subarray(end - WINDOW, end), SR, minFreq, maxFreq, HOP));
          if (on !== null) onsets.push(on);
        }
        expect(onsets, `gap ${gapSec * 1000} ms, offset ${offset}`).toEqual([67, 67]);
      }
    }
  });
});

describe('hopPeaks', () => {
  it('measures the two halves of the newest audio separately', () => {
    const buf = new Float32Array(4096);
    buf[4096 - 1000] = 0.5; // in the older half of the last 1584 samples
    buf[4096 - 10] = -0.2; // in the newest half
    buf[100] = 0.9; // long ago: ignored
    expect(hopPeaks(buf, 1584)).toEqual([0.5, expect.closeTo(0.2, 5)]);
    expect(analyseFrame(buf, SR, 60, 4400, 1584).peaks).toEqual([0.5, expect.closeTo(0.2, 5)]);
    expect(analyseFrame(buf, SR, 60, 4400).peaks).toBeUndefined();
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

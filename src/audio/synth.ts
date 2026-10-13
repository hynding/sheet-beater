import { midiToFrequency } from '../music/notes';

/**
 * A small additive synth with a piano-like envelope plus metronome clicks.
 * No samples to download, so it works offline and starts instantly on mobile
 * once the AudioContext has been unlocked by a user gesture.
 */
class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Must be called from a user gesture on iOS/Android to unlock audio. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  /** Audio clock in seconds, or performance time when audio is unavailable. */
  now(): number {
    const ctx = this.ensure();
    return ctx ? ctx.currentTime : performance.now() / 1000;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  play(midi: number, durationSec = 1.2, velocity = 0.8): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const freq = midiToFrequency(midi);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(velocity, now + 0.008);
    env.gain.exponentialRampToValueAtTime(velocity * 0.35, now + 0.25);
    env.gain.exponentialRampToValueAtTime(0.0005, now + durationSec);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12000, freq * 8), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.5), now + durationSec);

    const partials: Array<[number, number, OscillatorType]> = [
      [1, 1, 'triangle'],
      [2, 0.35, 'sine'],
      [3, 0.18, 'sine'],
      [4, 0.08, 'sine'],
    ];
    for (const [ratio, gain, type] of partials) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * ratio;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(filter);
      osc.start(now);
      osc.stop(now + durationSec + 0.05);
    }
    filter.connect(env).connect(this.master);
  }

  /** Short, soft low thud used for a wrong answer or timeout. */
  thud(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.4, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(env).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  /** Schedule a metronome click at an absolute audio-clock time. Returns a function that cancels it. */
  clickAt(time: number, accent = false): () => void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return () => undefined;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accent ? 1600 : 1100;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(env).connect(this.master);
    osc.start(time);
    osc.stop(time + 0.06);
    return () => {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    };
  }
}

export const synth = new Synth();

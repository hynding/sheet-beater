import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildTimeline, splitStep, stepIndexAt, totalBeats, type Piece, type PlayerHands, type Step } from '../music/score';
import { synth } from './synth';

export type PlayerMode = 'listen' | 'wait';

export interface PlayerState {
  playing: boolean;
  /** Current position in quarter-note beats from the start of the piece. */
  beat: number;
  bar: number;
  beatInBar: number;
  /** Pitches sounding right now, by hand. */
  activeTreble: number[];
  activeBass: number[];
  /** Wait mode: pitches the player must press to continue. */
  expected: number[];
  finished: boolean;
}

export interface PlayerControls {
  play: () => void;
  pause: () => void;
  stop: () => void;
  /** Jump to the start of a bar (0-based), whether playing or not. */
  seek: (bar: number) => void;
  /** Feed a key press; returns true when it completed the waited-for step. */
  notePressed: (midi: number) => boolean;
}

const LOOKAHEAD_SEC = 0.15;
const TICK_MS = 30;
const SEEK_SETTLE_SEC = LOOKAHEAD_SEC + 0.1;

/**
 * Drives playback of a piece. Listen mode schedules notes on the audio clock
 * a little ahead of time; wait mode advances one step at a time as the player
 * supplies the notes of the chosen hand (or both) and the app plays the rest.
 */
export function usePlayerPiano(piece: Piece | null, mode: PlayerMode, tempoFactor: number, loop: boolean, hands: PlayerHands = 'right'): [PlayerState, PlayerControls] {
  const steps = useMemo(() => (piece ? buildTimeline(piece) : []), [piece]);
  const total = piece ? totalBeats(piece) : 0;
  const secondsPerBeat = piece ? 60 / (piece.tempo * tempoFactor) : 1;

  const [state, setState] = useState<PlayerState>({ playing: false, beat: 0, bar: 0, beatInBar: 0, activeTreble: [], activeBass: [], expected: [], finished: false });
  const playing = useRef(false);
  const position = useRef(0); // beats, valid when paused
  const startBeat = useRef(0);
  const startTime = useRef(0);
  const nextStep = useRef(0);
  const waitStep = useRef(0);
  const pressed = useRef<Set<number>>(new Set());
  const timer = useRef<number | undefined>(undefined);
  const raf = useRef<number | undefined>(undefined);
  const waitTimer = useRef<number | undefined>(undefined);
  const sounding = useRef<Array<{ midi: number; hand: 'treble' | 'bass'; until: number }>>([]);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const handsRef = useRef(hands);
  handsRef.current = hands;

  const stepAtBeat = useCallback((beat: number) => stepIndexAt(steps, beat), [steps]);

  const clearTimers = () => {
    window.clearInterval(timer.current);
    window.clearTimeout(waitTimer.current);
    if (raf.current !== undefined) cancelAnimationFrame(raf.current);
  };

  const publish = useCallback(
    (beat: number, extra: Partial<PlayerState> = {}) => {
      const barBeats = piece?.barBeats ?? 4;
      const now = synth.now();
      sounding.current = sounding.current.filter((n) => n.until > now);
      setState((s) => ({
        ...s,
        beat,
        bar: Math.min(Math.max(0, piece ? piece.bars.length - 1 : 0), Math.floor(beat / barBeats)),
        beatInBar: beat - Math.floor(beat / barBeats) * barBeats,
        activeTreble: sounding.current.filter((n) => n.hand === 'treble').map((n) => n.midi),
        activeBass: sounding.current.filter((n) => n.hand === 'bass').map((n) => n.midi),
        ...extra,
      }));
    },
    [piece],
  );

  const soundStep = useCallback(
    (step: Step, at: number, hands: Array<'treble' | 'bass'>) => {
      for (const n of step.notes) {
        if (!hands.includes(n.hand)) continue;
        const dur = n.beats * secondsPerBeat;
        synth.noteAt(n.midi, at, Math.min(2.5, dur + 0.1), n.hand === 'treble' ? 0.8 : 0.55);
        sounding.current.push({ midi: n.midi, hand: n.hand, until: at + dur });
      }
    },
    [secondsPerBeat],
  );

  const stopInternal = useCallback(
    (finished: boolean) => {
      clearTimers();
      playing.current = false;
      position.current = 0;
      nextStep.current = 0;
      waitStep.current = 0;
      pressed.current = new Set();
      sounding.current = [];
      publish(0, { playing: false, expected: [], finished });
    },
    [publish],
  );

  /** Wait mode: present the current step, auto-playing steps that have no right-hand notes. */
  const presentWaitStep = useCallback(() => {
    window.clearTimeout(waitTimer.current);
    const i = waitStep.current;
    if (i >= steps.length) {
      if (loopRef.current && steps.length) {
        waitStep.current = 0;
        presentWaitStep();
      } else stopInternal(true);
      return;
    }
    const step = steps[i];
    pressed.current = new Set();
    const { want, auto } = splitStep(step, handsRef.current);
    if (want.length === 0) {
      // Nothing here for the player's hand: the app plays it and moves on in time.
      soundStep(step, synth.now(), auto);
      publish(step.beat, { expected: [] });
      waitStep.current = i + 1;
      waitTimer.current = window.setTimeout(presentWaitStep, step.gap * secondsPerBeat * 1000);
      return;
    }
    publish(step.beat, { expected: want });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, secondsPerBeat, soundStep, publish, stopInternal]);

  const play = useCallback(() => {
    if (!piece || playing.current) return;
    synth.unlock();
    playing.current = true;
    if (modeRef.current === 'wait') {
      waitStep.current = stepAtBeat(position.current);
      setState((s) => ({ ...s, playing: true, finished: false }));
      presentWaitStep();
      return;
    }
    startBeat.current = position.current;
    startTime.current = synth.now() + 0.1;
    nextStep.current = stepAtBeat(position.current);
    setState((s) => ({ ...s, playing: true, finished: false, expected: [] }));

    timer.current = window.setInterval(() => {
      const horizon = synth.now() + LOOKAHEAD_SEC;
      while (nextStep.current < steps.length) {
        const step = steps[nextStep.current];
        const at = startTime.current + (step.beat - startBeat.current) * secondsPerBeat;
        if (at > horizon) break;
        soundStep(step, at, ['treble', 'bass']);
        nextStep.current += 1;
      }
    }, TICK_MS);

    const frame = () => {
      // Playback is anchored slightly in the future; until it starts, hold at the anchor
      // rather than showing a position just before it.
      const beat = Math.max(startBeat.current, startBeat.current + (synth.now() - startTime.current) / secondsPerBeat);
      if (beat >= total) {
        if (loopRef.current) {
          startBeat.current = 0;
          startTime.current = synth.now();
          nextStep.current = 0;
          sounding.current = [];
        } else {
          stopInternal(true);
          return;
        }
      }
      position.current = Math.max(0, beat);
      publish(Math.max(0, beat));
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
  }, [piece, steps, secondsPerBeat, total, stepAtBeat, soundStep, publish, stopInternal, presentWaitStep]);

  const pause = useCallback(() => {
    if (!playing.current) return;
    clearTimers();
    playing.current = false;
    if (modeRef.current === 'wait') position.current = steps[waitStep.current]?.beat ?? 0;
    publish(position.current, { playing: false, expected: [] });
  }, [steps, publish]);

  const stop = useCallback(() => stopInternal(false), [stopInternal]);

  const notePressed = useCallback(
    (midi: number): boolean => {
      if (!playing.current || modeRef.current !== 'wait') return false;
      const step = steps[waitStep.current];
      if (!step) return false;
      const { want, auto } = splitStep(step, handsRef.current);
      if (!want.includes(midi)) return false;
      pressed.current.add(midi);
      if (!want.every((m) => pressed.current.has(m))) return false;
      soundStep(step, synth.now(), auto);
      waitStep.current += 1;
      position.current = steps[waitStep.current]?.beat ?? total;
      presentWaitStep();
      return true;
    },
    [steps, soundStep, presentWaitStep, total],
  );

  const seek = useCallback(
    (bar: number) => {
      if (!piece) return;
      const target = Math.max(0, Math.min(piece.bars.length - 1, Math.round(bar))) * piece.barBeats;
      position.current = target;
      sounding.current = [];
      if (!playing.current) {
        publish(target, { finished: false, expected: [] });
        return;
      }
      if (modeRef.current === 'wait') {
        waitStep.current = stepAtBeat(target);
        presentWaitStep();
        return;
      }
      // Listen mode: re-anchor the clock; the scheduler and cursor pick it up on their next tick.
      startBeat.current = target;
      // Start a little later than the scheduler looks ahead, so dragging across
      // several bars does not sound the first notes of every bar on the way.
      startTime.current = synth.now() + SEEK_SETTLE_SEC;
      nextStep.current = stepAtBeat(target);
      publish(target);
    },
    [piece, publish, stepAtBeat, presentWaitStep],
  );

  // Changing piece, mode, tempo or hands restarts from the top.
  useEffect(() => {
    stopInternal(false);
    return () => clearTimers();
  }, [piece, mode, tempoFactor, hands, stopInternal]);

  return [state, { play, pause, stop, seek, notePressed }];
}

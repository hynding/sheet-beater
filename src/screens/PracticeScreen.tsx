import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { synth } from '../audio/synth';
import { Piano, type KeyHighlight } from '../components/Piano';
import { Staff, type EventState } from '../components/Staff';
import { useComputerKeyboard } from '../input/useComputerKeyboard';
import { useMidiInput } from '../input/useMidiInput';
import type { KeyLabelMode, KeyboardSize, SessionConfig } from '../music/difficulty';
import { eventLabel, generatePrompts, keyboardRangeFor, type Prompt } from '../music/generator';
import { describeKey } from '../music/keys';
import { midiToName } from '../music/notes';
import { TIMING, chordProgress, isOnTime, judgeTiming, type Timing } from '../state/judge';
import type { Answer, SessionResult } from '../state/session';

export interface PracticeOptions {
  sound: boolean;
  keyLabels: KeyLabelMode;
  keyboardSize: KeyboardSize;
}

interface PracticeScreenProps {
  config: SessionConfig;
  options: PracticeOptions;
  title: string;
  onFinish: (result: SessionResult) => void;
  onQuit: () => void;
}

const CORRECT_DELAY_MS = 450;
const WRONG_DELAY_MS = 1500;
const BAR_END_DELAY_MS = 900;
const KEYBOARD_HEIGHT: Record<KeyboardSize, string> = { small: '30%', medium: '40%', large: '52%' };

type Phase = 'asking' | 'feedback' | 'countIn' | 'playing' | 'done';

interface Toast {
  kind: 'correct' | 'wrong' | 'info';
  text: string;
}

interface RhythmClock {
  t0: number;
  barStart: number;
  secondsPerBeat: number;
  beatsPerBar: number;
  judged: boolean[];
  /** Cancels any clicks still scheduled (used when quitting mid-bar). */
  stops: Array<() => void>;
}

export function PracticeScreen({ config, options, title, onFinish, onQuit }: PracticeScreenProps) {
  const prompts = useMemo(() => generatePrompts(config), [config]);
  const range = useMemo(() => keyboardRangeFor(config), [config]);
  const [index, setIndex] = useState(0);
  const [eventIndex, setEventIndex] = useState(0);
  const [states, setStates] = useState<EventState[]>([]);
  const [phase, setPhase] = useState<Phase>('asking');
  const [toast, setToast] = useState<Toast | null>(null);
  const [highlights, setHighlights] = useState<Partial<Record<number, KeyHighlight>>>({});
  const [mistakeKeys, setMistakeKeys] = useState<Set<number>>(() => new Set());
  const [beat, setBeat] = useState<number | null>(null);
  const [countIn, setCountIn] = useState<number | null>(null);

  const answers = useRef<Answer[]>([]);
  const startedAt = useRef(Date.now());
  const shownAt = useRef(performance.now());
  const pressed = useRef<number[]>([]);
  const phaseRef = useRef<Phase>('asking');
  const eventRef = useRef(0);
  const clock = useRef<RhythmClock | null>(null);
  const timers = useRef<number[]>([]);
  const raf = useRef<number | undefined>(undefined);

  const prompt: Prompt | null = prompts[index] ?? null;
  const finished = index >= prompts.length;
  const isRhythm = config.mode === 'rhythm';

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const record = useCallback((p: Prompt, ei: number, played: number[], correct: boolean, timing: Timing) => {
    answers.current.push({ prompt: p, eventIndex: ei, played, correct, responseMs: Math.round(performance.now() - shownAt.current), timing });
  }, []);

  const finish = useCallback(() => {
    onFinish({ config, answers: answers.current, startedAt: startedAt.current, endedAt: Date.now() });
  }, [onFinish, config]);

  const advancePrompt = useCallback(() => {
    setToast(null);
    setHighlights({});
    pressed.current = [];
    setIndex((i) => i + 1);
  }, []);

  /** Set up the next prompt (and for rhythm, the count-in) whenever the index changes. */
  useEffect(() => {
    if (!prompt) return;
    const firstPlayable = Math.max(0, prompt.events.findIndex((e) => !e.rest));
    eventRef.current = firstPlayable;
    setEventIndex(firstPlayable);
    setStates(prompt.events.map((_, i) => (i === firstPlayable && !isRhythm ? 'current' : 'pending')));
    pressed.current = [];
    shownAt.current = performance.now();
    if (!isRhythm) {
      setPhaseBoth('asking');
      return;
    }
    // Rhythm: one bar of count-in, then the bar itself. Clicks are scheduled on the audio clock.
    const secondsPerBeat = 60 / config.tempo;
    const beatsPerBar = (config.timeSignature[0] * 4) / config.timeSignature[1];
    const t0 = synth.now() + 0.35;
    const barStart = t0 + beatsPerBar * secondsPerBeat;
    const stops: Array<() => void> = [];
    for (let i = 0; i < beatsPerBar * 2; i++) stops.push(synth.clickAt(t0 + i * secondsPerBeat, i % beatsPerBar === 0));
    clock.current = { t0, barStart, secondsPerBeat, beatsPerBar, judged: prompt.events.map((e) => e.rest), stops };
    setPhaseBoth('countIn');
    setBeat(null);
    setCountIn(1);
    return () => stops.forEach((stop) => stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, isRhythm]);

  /** Rhythm animation loop: drives the count-in display, the playhead and missed-note detection. */
  useEffect(() => {
    if (!isRhythm || !prompt) return;
    const tick = () => {
      const c = clock.current;
      if (!c) return;
      const now = synth.now();
      if (now < c.barStart) {
        setCountIn(Math.max(1, Math.min(c.beatsPerBar, Math.floor((now - c.t0) / c.secondsPerBeat) + 1)));
        raf.current = requestAnimationFrame(tick);
        return;
      }
      if (phaseRef.current === 'countIn') {
        setPhaseBoth('playing');
        setCountIn(null);
        shownAt.current = performance.now();
      }
      const beatNow = (now - c.barStart) / c.secondsPerBeat;
      setBeat(beatNow);
      // Notes whose window has closed without a press are misses.
      prompt.events.forEach((e, i) => {
        if (c.judged[i]) return;
        const expected = c.barStart + e.beat * c.secondsPerBeat;
        if (now > expected + TIMING.good / 1000) {
          c.judged[i] = true;
          record(prompt, i, [], false, 'miss');
          setStates((s) => s.map((v, j) => (j === i ? 'wrong' : v)));
          setMistakeKeys((prev) => new Set(prev).add(e.notes[0].midi));
        }
      });
      if (beatNow >= c.beatsPerBar + TIMING.good / 1000 / c.secondsPerBeat) {
        setPhaseBoth('feedback');
        setBeat(c.beatsPerBar);
        later(advancePrompt, BAR_END_DELAY_MS);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, isRhythm]);

  const showAnswer = (p: Prompt, ei: number, played: number[]) => {
    const target = p.events[ei].notes.map((n) => n.midi);
    const h: Partial<Record<number, KeyHighlight>> = {};
    for (const m of played) if (!target.includes(m)) h[m] = 'wrong';
    for (const m of target) h[m] = 'answer';
    setHighlights(h);
    setMistakeKeys((prev) => {
      const next = new Set(prev);
      target.forEach((m) => next.add(m));
      return next;
    });
    if (options.sound) later(() => target.forEach((m) => synth.play(m)), played.length ? 400 : 250);
  };

  /** Non-rhythm: move to the next event in the phrase, or the next prompt. */
  const stepOn = (p: Prompt, ei: number, delay: number) => {
    const next = p.events.findIndex((e, i) => i > ei && !e.rest);
    later(() => {
      if (next === -1) {
        advancePrompt();
        return;
      }
      eventRef.current = next;
      setEventIndex(next);
      setStates((s) => s.map((v, i) => (i === next ? 'current' : v)));
      setHighlights({});
      setToast(null);
      pressed.current = [];
      shownAt.current = performance.now();
      setPhaseBoth('asking');
    }, delay);
  };

  const handleNoteOn = useCallback(
    (midi: number) => {
      if (options.sound) synth.play(midi);
      const p = prompts[index];
      if (!p) return;
      const phaseNow = phaseRef.current;

      if (isRhythm) {
        const c = clock.current;
        if (!c || phaseNow !== 'playing') return;
        const ei = p.events.findIndex((_, i) => !c.judged[i]);
        if (ei === -1) return;
        const e = p.events[ei];
        const now = synth.now();
        const expected = c.barStart + e.beat * c.secondsPerBeat;
        const timing = judgeTiming((now - expected) * 1000);
        const pitchOk = midi === e.notes[0].midi;
        const correct = pitchOk && isOnTime(timing);
        c.judged[ei] = true;
        record(p, ei, [midi], correct, timing);
        setStates((s) => s.map((v, j) => (j === ei ? (correct ? 'correct' : 'wrong') : v)));
        if (!correct) {
          setMistakeKeys((prev) => new Set(prev).add(e.notes[0].midi));
          setToast({ kind: 'wrong', text: !pitchOk ? `That was ${eventLabel(e)}` : timing === 'early' ? 'Early' : 'Late' });
          later(() => setToast(null), 700);
        }
        return;
      }

      if (phaseNow !== 'asking') return;
      const ei = eventRef.current;
      const e = p.events[ei];
      const target = e.notes.map((n) => n.midi);

      if (p.mode === 'chord') {
        pressed.current = [...pressed.current, midi];
        const result = chordProgress(target, pressed.current);
        if (result === 'pending') {
          setHighlights(Object.fromEntries(pressed.current.map((m) => [m, 'held' as KeyHighlight])));
          return;
        }
        const correct = result === 'correct';
        record(p, ei, pressed.current, correct, 'none');
        setPhaseBoth('feedback');
        setStates((s) => s.map((v, i) => (i === ei ? (correct ? 'correct' : 'wrong') : v)));
        if (correct) {
          setHighlights(Object.fromEntries(target.map((m) => [m, 'correct' as KeyHighlight])));
          setToast({ kind: 'correct', text: 'Correct!' });
        } else {
          showAnswer(p, ei, pressed.current);
          setToast({ kind: 'wrong', text: `That was ${eventLabel(e)}.` });
        }
        stepOn(p, ei, correct ? CORRECT_DELAY_MS : WRONG_DELAY_MS);
        return;
      }

      const correct = midi === target[0];
      record(p, ei, [midi], correct, 'none');
      setPhaseBoth('feedback');
      setStates((s) => s.map((v, i) => (i === ei ? (correct ? 'correct' : 'wrong') : v)));
      if (correct) {
        setHighlights({ [midi]: 'correct' });
        if (p.events.length === 1) setToast({ kind: 'correct', text: 'Correct!' });
      } else {
        showAnswer(p, ei, [midi]);
        setToast({ kind: 'wrong', text: `That was ${eventLabel(e)}, you played ${midiToName(midi)}.` });
      }
      stepOn(p, ei, correct ? (p.events.length === 1 ? CORRECT_DELAY_MS : 120) : WRONG_DELAY_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prompts, index, isRhythm, options.sound, record],
  );

  /** Per-event time limit (non-rhythm modes). */
  useEffect(() => {
    if (!prompt || isRhythm || config.timeLimitMs <= 0 || phase !== 'asking') return;
    const ei = eventIndex;
    const id = window.setTimeout(() => {
      if (phaseRef.current !== 'asking' || eventRef.current !== ei) return;
      const e = prompt.events[ei];
      record(prompt, ei, [], false, 'none');
      setPhaseBoth('feedback');
      setStates((s) => s.map((v, i) => (i === ei ? 'wrong' : v)));
      if (options.sound) synth.thud();
      showAnswer(prompt, ei, []);
      setToast({ kind: 'wrong', text: `Time's up. That was ${eventLabel(e)}.` });
      stepOn(prompt, ei, WRONG_DELAY_MS);
    }, config.timeLimitMs);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, eventIndex, phase, config.timeLimitMs, isRhythm]);

  useEffect(() => {
    if (finished) finish();
  }, [finished, finish]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    },
    [],
  );

  useMidiInput((midi) => handleNoteOn(midi));
  const { baseMidi } = useComputerKeyboard(handleNoteOn);

  const labelled = options.keyLabels === 'always' ? 'all' : options.keyLabels === 'onMistake' ? mistakeKeys : undefined;
  const correctCount = answers.current.filter((a) => a.correct).length;
  const answered = answers.current.length;
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };
  const beatsPerBar = clock.current?.beatsPerBar ?? (config.timeSignature[0] * 4) / config.timeSignature[1];
  const activeBeat = countIn !== null ? countIn - 1 : beat !== null ? Math.floor(beat) : -1;
  const instruction =
    prompt?.mode === 'chord' ? 'Play every note of the chord' : prompt?.mode === 'sequence' ? 'Play the blue note' : prompt?.mode === 'rhythm' ? (countIn !== null ? 'Count in' : phase === 'playing' ? 'Play' : '') : '';

  return (
    <div className="screen practice">
      <header className="hud">
        <button type="button" className="btn btn--ghost" onClick={onQuit} aria-label="Quit session">
          ✕
        </button>
        <div className="hud__title">
          <span className="hud__name">{title}</span>
          {prompt && prompt.key !== 'C' && <span className="muted small">{describeKey(prompt.key)}</span>}
        </div>
        <div className="hud__progress" aria-label="Progress">
          <span className="hud__count">
            {Math.min(index + 1, prompts.length)} / {prompts.length}
          </span>
          <div className="bar">
            <div className="bar__fill" style={{ width: `${(index / prompts.length) * 100}%` }} />
          </div>
        </div>
        <div className="hud__score" aria-label="Correct answers">
          <span className="hud__tick">✓</span> {correctCount}
          {answered > correctCount && <span className="hud__miss"> ✗ {answered - correctCount}</span>}
        </div>
        {isRhythm && (
          <div className={`beats${countIn !== null ? ' beats--countin' : ''}`} aria-label={instruction}>
            {Array.from({ length: beatsPerBar }, (_, i) => (
              <span key={i} className={`beats__dot${i === activeBeat ? ' beats__dot--on' : ''}`}>
                {i + 1}
              </span>
            ))}
          </div>
        )}
        {!isRhythm && config.timeLimitMs > 0 && prompt && (
          <div className="bar bar--timer" aria-hidden="true">
            <div
              key={`${prompt.id}-${eventIndex}`}
              className={`bar__fill bar__fill--timer${phase !== 'asking' ? ' bar__fill--paused' : ''}`}
              style={{ animationDuration: `${config.timeLimitMs}ms` }}
            />
          </div>
        )}
        <span className="hud__hint muted small">Keys from {midiToName(baseMidi)}</span>
        {canFullscreen && (
          <button type="button" className="btn btn--ghost" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
            ⛶
          </button>
        )}
      </header>

      <div className="practice__staff">
        <Staff clefMode={config.clef} prompt={prompt} states={states} playheadBeat={isRhythm && phase !== 'countIn' ? beat : null} />
        {instruction && !toast && <div className="instruction muted small">{instruction}</div>}
        {toast && (
          <div className={`toast toast--${toast.kind}`} role="status">
            {toast.text}
          </div>
        )}
      </div>

      <div className="practice__piano" style={{ flexBasis: KEYBOARD_HEIGHT[options.keyboardSize] }}>
        <Piano low={range.low} high={range.high} onNoteOn={handleNoteOn} highlights={highlights} labelled={labelled} disabled={!prompt || phase === 'feedback'} />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { synth } from '../audio/synth';
import { Piano, type KeyHighlight } from '../components/Piano';
import { Staff, type Feedback } from '../components/Staff';
import { useComputerKeyboard } from '../input/useComputerKeyboard';
import { useMidiInput } from '../input/useMidiInput';
import type { Settings } from '../music/difficulty';
import { generatePrompts, keyboardRangeFor, type Prompt } from '../music/generator';
import { midiToName, spellingToLabel } from '../music/notes';
import type { Answer, SessionResult } from '../state/session';

interface PracticeScreenProps {
  settings: Settings;
  onFinish: (result: SessionResult) => void;
  onQuit: () => void;
}

const CORRECT_DELAY_MS = 450;
const WRONG_DELAY_MS = 1500;
const KEYBOARD_HEIGHT: Record<Settings['keyboardSize'], string> = { small: '30%', medium: '40%', large: '52%' };

interface Outcome {
  prompt: Prompt;
  playedMidi: number | null;
  correct: boolean;
}

export function PracticeScreen({ settings, onFinish, onQuit }: PracticeScreenProps) {
  const prompts = useMemo(() => generatePrompts(settings), [settings]);
  const range = useMemo(() => keyboardRangeFor(settings), [settings]);
  const [index, setIndex] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [mistakeKeys, setMistakeKeys] = useState<Set<number>>(() => new Set());
  const answers = useRef<Answer[]>([]);
  const startedAt = useRef(Date.now());
  const shownAt = useRef(performance.now());
  const advanceTimer = useRef<number | undefined>(undefined);
  const timeoutTimer = useRef<number | undefined>(undefined);

  const prompt = prompts[index] ?? null;
  const finished = index >= prompts.length;

  const finish = useCallback(() => {
    onFinish({ settings, answers: answers.current, startedAt: startedAt.current, endedAt: Date.now() });
  }, [onFinish, settings]);

  const record = useCallback(
    (playedMidi: number | null) => {
      if (!prompt || outcome) return;
      const correct = playedMidi === prompt.midi;
      const responseMs = Math.round(performance.now() - shownAt.current);
      answers.current.push({ prompt, playedMidi, correct, responseMs });
      window.clearTimeout(timeoutTimer.current);
      setOutcome({ prompt, playedMidi, correct });
      if (!correct) {
        setMistakeKeys((prev) => new Set(prev).add(prompt.midi));
        if (settings.sound) {
          if (playedMidi === null) synth.thud();
          window.setTimeout(() => synth.play(prompt.midi), playedMidi === null ? 250 : 400);
        }
      }
      advanceTimer.current = window.setTimeout(
        () => {
          setOutcome(null);
          setIndex((i) => i + 1);
        },
        correct ? CORRECT_DELAY_MS : WRONG_DELAY_MS,
      );
    },
    [prompt, outcome, settings.sound],
  );

  const handleNoteOn = useCallback(
    (midi: number) => {
      if (settings.sound) synth.play(midi);
      record(midi);
    },
    [record, settings.sound],
  );

  // Start the per-note clock (and time limit) whenever a new prompt appears.
  useEffect(() => {
    if (!prompt) return;
    shownAt.current = performance.now();
    if (settings.timeLimitMs > 0) {
      timeoutTimer.current = window.setTimeout(() => record(null), settings.timeLimitMs);
    }
    return () => window.clearTimeout(timeoutTimer.current);
    // `record` changes with `outcome`; we only want to arm the timer when the prompt changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, settings.timeLimitMs]);

  useEffect(() => {
    if (finished) finish();
  }, [finished, finish]);

  useEffect(() => () => {
    window.clearTimeout(advanceTimer.current);
    window.clearTimeout(timeoutTimer.current);
  }, []);

  useMidiInput((midi) => handleNoteOn(midi));
  const { baseMidi } = useComputerKeyboard(handleNoteOn);

  const highlights = useMemo(() => {
    const h: Partial<Record<number, KeyHighlight>> = {};
    if (outcome) {
      if (outcome.correct) h[outcome.prompt.midi] = 'correct';
      else {
        if (outcome.playedMidi !== null) h[outcome.playedMidi] = 'wrong';
        h[outcome.prompt.midi] = 'answer';
      }
    }
    return h;
  }, [outcome]);

  const labelled = settings.keyLabels === 'always' ? 'all' : settings.keyLabels === 'onMistake' ? mistakeKeys : undefined;
  const feedback: Feedback = outcome ? (outcome.correct ? 'correct' : 'wrong') : 'none';
  const correctCount = answers.current.filter((a) => a.correct).length;
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  return (
    <div className="screen practice">
      <header className="hud">
        <button type="button" className="btn btn--ghost" onClick={onQuit} aria-label="Quit session">
          ✕
        </button>
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
        </div>
        {settings.timeLimitMs > 0 && prompt && (
          <div className="bar bar--timer" aria-hidden="true">
            <div
              key={prompt.id}
              className={`bar__fill bar__fill--timer${outcome ? ' bar__fill--paused' : ''}`}
              style={{ animationDuration: `${settings.timeLimitMs}ms` }}
            />
          </div>
        )}
        <span className="hud__hint muted small">Keys start at {midiToName(baseMidi)}</span>
        {canFullscreen && (
          <button type="button" className="btn btn--ghost" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
            ⛶
          </button>
        )}
      </header>

      <div className="practice__staff">
        <Staff clefMode={settings.clef} prompt={prompt} feedback={feedback} />
        {outcome && (
          <div className={`toast toast--${outcome.correct ? 'correct' : 'wrong'}`} role="status">
            {outcome.correct
              ? 'Correct!'
              : outcome.playedMidi === null
                ? `Time's up. That was ${spellingToLabel(outcome.prompt.spelling)}.`
                : `That was ${spellingToLabel(outcome.prompt.spelling)}, you played ${midiToName(outcome.playedMidi)}.`}
          </div>
        )}
      </div>

      <div className="practice__piano" style={{ flexBasis: KEYBOARD_HEIGHT[settings.keyboardSize] }}>
        <Piano low={range.low} high={range.high} onNoteOn={handleNoteOn} highlights={highlights} labelled={labelled} disabled={!prompt || !!outcome} />
      </div>
    </div>
  );
}

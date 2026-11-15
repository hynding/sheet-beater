import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { synth } from './audio/synth';
import type { Lesson } from './curriculum/lessons';
import { lessonAfter, loadProgress, recordResult, saveProgress, type Progress, type Stars } from './curriculum/progress';
import { useMidiInput } from './input/useMidiInput';
import { applyPreset, configOf, loadSettings, saveSettings, type PresetId, type SessionConfig, type Settings } from './music/difficulty';
import { LoadBoundary } from './components/LoadBoundary';
import { CalibrationDialog } from './screens/CalibrationDialog';
import { ResultsScreen } from './screens/ResultsScreen';
import { StartScreen, type StartTab } from './screens/StartScreen';
import { addSession, loadHistory, saveHistory, type History } from './state/history';
import { focusWeights, loadMastery, recordAnswers, saveMastery, weakNotes, weakSpotConfig, type Mastery } from './state/mastery';
import { summarize, type SessionResult } from './state/session';

// Every screen that draws notation pulls in the engraving library and its
// music font, which are several times larger than the rest of the app. They
// load on demand so the start screen is usable straight away.
const loadPractice = () => import('./screens/PracticeScreen');
const loadFreePlay = () => import('./screens/FreePlayScreen');
const loadLessonIntro = () => import('./screens/LessonIntroScreen');
const PracticeScreen = lazy(() => loadPractice().then((m) => ({ default: m.PracticeScreen })));
const FreePlayScreen = lazy(() => loadFreePlay().then((m) => ({ default: m.FreePlayScreen })));
const LessonIntroScreen = lazy(() => loadLessonIntro().then((m) => ({ default: m.LessonIntroScreen })));

/** Where a session was started from; decides its title, where "back" goes and what the results offer. */
type Source = 'lesson' | 'free' | 'weak';

type Screen =
  | { name: 'start' }
  | { name: 'intro'; lesson: Lesson }
  | { name: 'play'; pieceId: string | null }
  | { name: 'practice'; run: number; config: SessionConfig; source: Source; lesson?: Lesson }
  | { name: 'results'; result: SessionResult; source: Source; lesson?: Lesson; stars?: Stars; improved?: boolean };

const TITLES: Record<Source, string> = { lesson: '', free: 'Free practice', weak: 'Weak spots' };

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [mastery, setMastery] = useState<Mastery>(loadMastery);
  const [history, setHistory] = useState<History>(loadHistory);
  const [tab, setTab] = useState<StartTab>('learn');
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [portrait, setPortrait] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const midi = useMidiInput(() => undefined, screen.name === 'start');

  // Fetch the notation screens in the background once the start screen has painted.
  useEffect(() => {
    // Best effort: if this fails the screen loads (and reports failure) when it is opened.
    const warm = () => {
      for (const load of [loadLessonIntro, loadPractice, loadFreePlay]) load().catch(() => undefined);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 300);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => saveMastery(mastery), [mastery]);
  useEffect(() => saveHistory(history), [history]);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const beginSession = useCallback(
    (config: SessionConfig, source: Source, lesson?: Lesson) => {
      synth.unlock();
      const orientation = window.screen.orientation as { lock?: (o: string) => Promise<void> } | undefined;
      orientation?.lock?.('landscape').catch(() => undefined);
      // Single-note sessions lean toward the positions this learner has been missing.
      const adaptive = config.mode === 'single' ? { ...config, focus: focusWeights(mastery) } : config;
      setScreen({ name: 'practice', run: Date.now(), config: adaptive, source, lesson });
    },
    [mastery],
  );

  const finishSession = useCallback(
    (result: SessionResult, source: Source, lesson?: Lesson) => {
      setMastery((m) => recordAnswers(m, result.answers));
      setHistory((h) => addSession(h, result, source, lesson?.id));
      if (!lesson) {
        setScreen({ name: 'results', result, source });
        return;
      }
      const outcome = recordResult(progress, lesson, summarize(result));
      setProgress(outcome.progress);
      setScreen({ name: 'results', result, source, lesson, stars: outcome.stars, improved: outcome.improved });
    },
    [progress],
  );

  const levelUp = useCallback(
    (preset: PresetId) => {
      const next = applyPreset(settings, preset);
      setSettings(next);
      beginSession(configOf(next), 'free');
    },
    [settings, beginSession],
  );

  const resetProgress = useCallback(() => {
    setProgress({});
    setMastery({});
    setHistory([]);
  }, []);

  const weak = weakNotes(mastery);
  const startWeakSpots = useCallback(() => {
    const config = weakSpotConfig(mastery);
    if (config) beginSession(config, 'weak');
  }, [mastery, beginSession]);

  const options = {
    sound: settings.sound,
    keyLabels: settings.keyLabels,
    keyboardSize: settings.keyboardSize,
    timingStrictness: settings.timingStrictness,
    timingOffsetMs: settings.timingOffsetMs,
  };

  return (
    <div className="app">
      {portrait && <div className="rotate-banner">Rotate your device to landscape for the best layout.</div>}
      {screen.name === 'start' && (
        <StartScreen
          tab={tab}
          onTab={setTab}
          settings={settings}
          onChange={setSettings}
          onStartFree={() => beginSession(configOf(settings), 'free')}
          weakNotes={weak}
          onPracticeWeak={startWeakSpots}
          history={history}
          mastery={mastery}
          onResetProgress={resetProgress}
          onCalibrate={() => setCalibrating(true)}
          progress={progress}
          onSelectLesson={(lesson) => setScreen({ name: 'intro', lesson })}
          onFreePlay={(pieceId) => {
            synth.unlock();
            setScreen({ name: 'play', pieceId });
          }}
          midi={midi}
        />
      )}
      <LoadBoundary key={screen.name} onBack={() => setScreen({ name: 'start' })}>
        <Suspense
          fallback={
            <div className="screen loading" role="status">
              Loading the notation…
            </div>
          }
        >
          {screen.name === 'play' && (
            <FreePlayScreen
              initialPieceId={screen.pieceId}
              keyboardSize={settings.keyboardSize}
              keyLabels={settings.keyLabels === 'always'}
              onBack={() => {
                setTab('play');
                setScreen({ name: 'start' });
              }}
            />
          )}
          {screen.name === 'intro' && (
            <LessonIntroScreen lesson={screen.lesson} progress={progress} onStart={() => beginSession(screen.lesson.config, 'lesson', screen.lesson)} onBack={() => setScreen({ name: 'start' })} onCalibrate={() => setCalibrating(true)} />
          )}
          {screen.name === 'practice' && (
            <PracticeScreen
              key={screen.run}
              config={screen.config}
              options={options}
              title={screen.lesson ? screen.lesson.title : TITLES[screen.source]}
              onFinish={(result) => finishSession(result, screen.source, screen.lesson)}
              onQuit={() => setScreen(screen.lesson ? { name: 'intro', lesson: screen.lesson } : { name: 'start' })}
            />
          )}
        </Suspense>
      </LoadBoundary>
      {screen.name === 'results' && (
        <ResultsScreen
          result={screen.result}
          lesson={screen.lesson}
          stars={screen.stars}
          improved={screen.improved}
          nextLesson={screen.lesson ? lessonAfter(screen.lesson) : undefined}
          presetId={screen.source === 'free' ? settings.preset : undefined}
          backLabel={screen.source === 'free' ? 'Change settings' : 'Back to path'}
          onPlayAgain={() => {
            // Weak spots are rebuilt from the latest record so mastered notes drop out.
            const config = screen.source === 'weak' ? weakSpotConfig(mastery) : screen.result.config;
            if (config) beginSession(config, screen.source, screen.lesson);
            else setScreen({ name: 'start' });
          }}
          onNext={() => {
            const next = screen.lesson && lessonAfter(screen.lesson);
            if (next) setScreen({ name: 'intro', lesson: next });
          }}
          onLevelUp={levelUp}
          onCalibrate={() => setCalibrating(true)}
          onBack={() => {
            setTab(screen.source === 'free' ? 'free' : 'learn');
            setScreen({ name: 'start' });
          }}
        />
      )}
      {calibrating && (
        <CalibrationDialog
          current={settings.timingOffsetMs}
          onSave={(timingOffsetMs) => {
            setSettings((prev) => ({ ...prev, timingOffsetMs }));
            setCalibrating(false);
          }}
          onClose={() => setCalibrating(false)}
        />
      )}
    </div>
  );
}

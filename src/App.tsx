import { useCallback, useEffect, useState } from 'react';
import { synth } from './audio/synth';
import type { Lesson } from './curriculum/lessons';
import { lessonAfter, loadProgress, recordResult, saveProgress, type Progress, type Stars } from './curriculum/progress';
import { useMidiInput } from './input/useMidiInput';
import { applyPreset, configOf, loadSettings, saveSettings, type PresetId, type SessionConfig, type Settings } from './music/difficulty';
import { LessonIntroScreen } from './screens/LessonIntroScreen';
import { FreePlayScreen } from './screens/FreePlayScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { StartScreen, type StartTab } from './screens/StartScreen';
import { focusWeights, loadMastery, recordAnswers, saveMastery, weakNotes, weakSpotConfig, type Mastery } from './state/mastery';
import { summarize, type SessionResult } from './state/session';

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
  const [tab, setTab] = useState<StartTab>('learn');
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [portrait, setPortrait] = useState(false);
  const midi = useMidiInput(() => undefined, screen.name === 'start');

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => saveMastery(mastery), [mastery]);

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

  const weak = weakNotes(mastery);
  const startWeakSpots = useCallback(() => {
    const config = weakSpotConfig(mastery);
    if (config) beginSession(config, 'weak');
  }, [mastery, beginSession]);

  const options = { sound: settings.sound, keyLabels: settings.keyLabels, keyboardSize: settings.keyboardSize };

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
          progress={progress}
          onSelectLesson={(lesson) => setScreen({ name: 'intro', lesson })}
          onFreePlay={(pieceId) => {
            synth.unlock();
            setScreen({ name: 'play', pieceId });
          }}
          midi={midi}
        />
      )}
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
        <LessonIntroScreen lesson={screen.lesson} progress={progress} onStart={() => beginSession(screen.lesson.config, 'lesson', screen.lesson)} onBack={() => setScreen({ name: 'start' })} />
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
          onBack={() => {
            setTab(screen.source === 'free' ? 'free' : 'learn');
            setScreen({ name: 'start' });
          }}
        />
      )}
    </div>
  );
}

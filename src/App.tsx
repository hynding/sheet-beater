import { useCallback, useEffect, useState } from 'react';
import { synth } from './audio/synth';
import type { Lesson } from './curriculum/lessons';
import { lessonAfter, loadProgress, recordResult, saveProgress, type Progress, type Stars } from './curriculum/progress';
import { useMidiInput } from './input/useMidiInput';
import { applyPreset, configOf, loadSettings, saveSettings, type PresetId, type SessionConfig, type Settings } from './music/difficulty';
import { LessonIntroScreen } from './screens/LessonIntroScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { StartScreen, type StartTab } from './screens/StartScreen';
import { summarize, type SessionResult } from './state/session';

type Screen =
  | { name: 'start' }
  | { name: 'intro'; lesson: Lesson }
  | { name: 'practice'; run: number; config: SessionConfig; lesson?: Lesson }
  | { name: 'results'; result: SessionResult; lesson?: Lesson; stars?: Stars; improved?: boolean };

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [tab, setTab] = useState<StartTab>('learn');
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [portrait, setPortrait] = useState(false);
  const midi = useMidiInput(() => undefined, screen.name === 'start');

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveProgress(progress), [progress]);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const beginSession = useCallback((config: SessionConfig, lesson?: Lesson) => {
    synth.unlock();
    const orientation = window.screen.orientation as { lock?: (o: string) => Promise<void> } | undefined;
    orientation?.lock?.('landscape').catch(() => undefined);
    setScreen({ name: 'practice', run: Date.now(), config, lesson });
  }, []);

  const finishSession = useCallback(
    (result: SessionResult, lesson?: Lesson) => {
      if (!lesson) {
        setScreen({ name: 'results', result });
        return;
      }
      const outcome = recordResult(progress, lesson, summarize(result));
      setProgress(outcome.progress);
      setScreen({ name: 'results', result, lesson, stars: outcome.stars, improved: outcome.improved });
    },
    [progress],
  );

  const levelUp = useCallback((preset: PresetId) => {
    setSettings((s) => {
      const next = applyPreset(s, preset);
      setScreen({ name: 'practice', run: Date.now(), config: configOf(next) });
      return next;
    });
  }, []);

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
          onStartFree={() => beginSession(configOf(settings))}
          progress={progress}
          onSelectLesson={(lesson) => setScreen({ name: 'intro', lesson })}
          midi={midi}
        />
      )}
      {screen.name === 'intro' && (
        <LessonIntroScreen lesson={screen.lesson} progress={progress} onStart={() => beginSession(screen.lesson.config, screen.lesson)} onBack={() => setScreen({ name: 'start' })} />
      )}
      {screen.name === 'practice' && (
        <PracticeScreen
          key={screen.run}
          config={screen.config}
          options={options}
          title={screen.lesson ? screen.lesson.title : 'Free practice'}
          onFinish={(result) => finishSession(result, screen.lesson)}
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
          presetId={settings.preset}
          onPlayAgain={() => beginSession(screen.result.config, screen.lesson)}
          onNext={() => {
            const next = screen.lesson && lessonAfter(screen.lesson);
            if (next) setScreen({ name: 'intro', lesson: next });
          }}
          onLevelUp={levelUp}
          onBack={() => {
            setTab(screen.lesson ? 'learn' : 'free');
            setScreen({ name: 'start' });
          }}
        />
      )}
    </div>
  );
}

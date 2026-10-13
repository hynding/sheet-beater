import { useCallback, useEffect, useState } from 'react';
import { synth } from './audio/synth';
import { useMidiInput } from './input/useMidiInput';
import { applyPreset, loadSettings, saveSettings, type PresetId, type Settings } from './music/difficulty';
import { PracticeScreen } from './screens/PracticeScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { StartScreen } from './screens/StartScreen';
import type { SessionResult } from './state/session';

type Screen = { name: 'start' } | { name: 'practice'; run: number } | { name: 'results'; result: SessionResult };

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [portrait, setPortrait] = useState(false);
  const midi = useMidiInput(() => undefined, screen.name === 'start');

  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const start = useCallback(() => {
    synth.unlock();
    const orientation = screen.name === 'start' ? (window.screen.orientation as { lock?: (o: string) => Promise<void> } | undefined) : undefined;
    orientation?.lock?.('landscape').catch(() => undefined);
    setScreen({ name: 'practice', run: Date.now() });
  }, [screen.name]);

  const levelUp = useCallback(
    (preset: PresetId) => {
      setSettings((s) => applyPreset(s, preset));
      setScreen({ name: 'practice', run: Date.now() });
    },
    [],
  );

  return (
    <div className="app">
      {portrait && <div className="rotate-banner">Rotate your device to landscape for the best layout.</div>}
      {screen.name === 'start' && <StartScreen settings={settings} onChange={setSettings} onStart={start} midi={midi} />}
      {screen.name === 'practice' && (
        <PracticeScreen
          key={screen.run}
          settings={settings}
          onFinish={(result) => setScreen({ name: 'results', result })}
          onQuit={() => setScreen({ name: 'start' })}
        />
      )}
      {screen.name === 'results' && (
        <ResultsScreen
          result={screen.result}
          onPlayAgain={() => setScreen({ name: 'practice', run: Date.now() })}
          onChangeSettings={() => setScreen({ name: 'start' })}
          onLevelUp={levelUp}
        />
      )}
    </div>
  );
}

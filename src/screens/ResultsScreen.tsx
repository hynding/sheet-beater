import { useMemo } from 'react';
import { PRESETS, type PresetId } from '../music/difficulty';
import { midiToName, spellingToLabel } from '../music/notes';
import { summarize, type SessionResult } from '../state/session';

interface ResultsScreenProps {
  result: SessionResult;
  onPlayAgain: () => void;
  onChangeSettings: () => void;
  onLevelUp: (preset: PresetId) => void;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function ResultsScreen({ result, onPlayAgain, onChangeSettings, onLevelUp }: ResultsScreenProps) {
  const s = useMemo(() => summarize(result), [result]);
  const pct = Math.round(s.accuracy * 100);
  const presetIndex = PRESETS.findIndex((p) => p.id === result.settings.preset);
  const nextPreset = presetIndex >= 0 && presetIndex < PRESETS.length - 1 && pct >= 90 ? PRESETS[presetIndex + 1] : null;
  const weakNotes = s.byNote.filter((n) => n.correct < n.asked).slice(0, 8);
  const grade = pct >= 95 ? 'Outstanding' : pct >= 85 ? 'Great work' : pct >= 70 ? 'Good progress' : 'Keep practising';

  return (
    <div className="screen results">
      <header className="results__hero">
        <div className="results__pct">{pct}%</div>
        <div>
          <h1 className="results__grade">{grade}</h1>
          <p className="muted">
            {s.correct} of {s.total} notes right in {formatSeconds(s.durationMs)}.
          </p>
        </div>
      </header>

      <section className="results__body">
        <div className="tiles">
          <div className="tile">
            <span className="tile__value">{s.correct ? formatSeconds(s.avgMs) : '–'}</span>
            <span className="tile__label">Average time</span>
          </div>
          <div className="tile">
            <span className="tile__value">{s.correct ? formatSeconds(s.medianMs) : '–'}</span>
            <span className="tile__label">Median time</span>
          </div>
          <div className="tile">
            <span className="tile__value">{s.bestStreak}</span>
            <span className="tile__label">Best streak</span>
          </div>
          <div className="tile">
            <span className="tile__value">{s.missed.length}</span>
            <span className="tile__label">Missed{s.timeouts ? ` (${s.timeouts} timed out)` : ''}</span>
          </div>
        </div>

        <div className="panel">
          <h2 className="panel__title">Notes to work on</h2>
          {weakNotes.length === 0 ? (
            <p className="muted">Perfect score. Nothing missed.</p>
          ) : (
            <ul className="notelist">
              {weakNotes.map((n) => (
                <li key={`${n.clef}:${n.label}`} className="notelist__item">
                  <span className="notelist__name">{n.label}</span>
                  <span className="muted small">{n.clef} clef</span>
                  <span className="notelist__stat">
                    {n.correct}/{n.asked}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {s.missed.length > 0 && (
            <details className="details">
              <summary>Every miss</summary>
              <ul className="misses">
                {s.missed.map((a, i) => (
                  <li key={i}>
                    {spellingToLabel(a.prompt.spelling)} ({a.prompt.clef}) → {a.playedMidi === null ? 'timed out' : `played ${midiToName(a.playedMidi)}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>

      <footer className="results__footer">
        <button type="button" className="btn" onClick={onChangeSettings}>
          Change settings
        </button>
        <button type="button" className="btn btn--primary" onClick={onPlayAgain}>
          Play again
        </button>
        {nextPreset && (
          <button type="button" className="btn btn--accent" onClick={() => onLevelUp(nextPreset.id)}>
            Try {nextPreset.name} →
          </button>
        )}
      </footer>
    </div>
  );
}

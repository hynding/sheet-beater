import { useMemo } from 'react';
import type { Lesson } from '../curriculum/lessons';
import type { Stars } from '../curriculum/progress';
import { PRESETS, type PresetId } from '../music/difficulty';
import { midiToName } from '../music/notes';
import { summarize, type SessionResult } from '../state/session';
import { eventLabel } from '../music/generator';
import { StarRow } from './LearnPath';

interface ResultsScreenProps {
  result: SessionResult;
  /** Set when the session was a lesson. */
  lesson?: Lesson;
  stars?: Stars;
  improved?: boolean;
  nextLesson?: Lesson;
  presetId?: PresetId | 'custom';
  onPlayAgain: () => void;
  onNext?: () => void;
  onLevelUp?: (preset: PresetId) => void;
  onBack: () => void;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function ResultsScreen({ result, lesson, stars, improved, nextLesson, presetId, onPlayAgain, onNext, onLevelUp, onBack }: ResultsScreenProps) {
  const s = useMemo(() => summarize(result), [result]);
  const pct = Math.round(s.accuracy * 100);
  const isRhythm = result.config.mode === 'rhythm';
  const presetIndex = PRESETS.findIndex((p) => p.id === presetId);
  const nextPreset = !lesson && presetIndex >= 0 && presetIndex < PRESETS.length - 1 && pct >= 90 ? PRESETS[presetIndex + 1] : null;
  const weakNotes = s.byNote.filter((n) => n.correct < n.asked).slice(0, 8);
  const grade = lesson
    ? stars === 3
      ? 'Mastered'
      : stars === 2
        ? 'Well done'
        : stars === 1
          ? 'Passed'
          : 'Not yet'
    : pct >= 95
      ? 'Outstanding'
      : pct >= 85
        ? 'Great work'
        : pct >= 70
          ? 'Good progress'
          : 'Keep practising';
  const unitLabel = result.config.mode === 'chord' ? 'chords' : result.config.mode === 'rhythm' ? 'notes in time' : 'notes';
  const timed = s.timing.perfect + s.timing.good + s.timing.early + s.timing.late + s.timing.miss;

  return (
    <div className="screen results">
      <header className="results__hero">
        <div className="results__pct">{pct}%</div>
        <div>
          <h1 className="results__grade">{grade}</h1>
          <p className="muted">
            {lesson ? `${lesson.title}: ` : ''}
            {s.correct} of {s.total} {unitLabel} right in {formatSeconds(s.durationMs)}.
          </p>
        </div>
        {lesson && stars !== undefined && (
          <div className="results__stars">
            <StarRow stars={stars} size="big" />
            <span className="muted small">
              {stars === 0 ? `Need ${Math.round(lesson.mastery * 100)}% to pass` : improved ? 'New best!' : 'Best kept'}
            </span>
          </div>
        )}
      </header>

      <section className="results__body">
        <div className="tiles">
          {isRhythm ? (
            <>
              <div className="tile">
                <span className="tile__value">{timed ? Math.round((s.timing.perfect / timed) * 100) : 0}%</span>
                <span className="tile__label">Perfectly on the beat</span>
              </div>
              <div className="tile">
                <span className="tile__value">
                  {s.timing.early} / {s.timing.late}
                </span>
                <span className="tile__label">Early / late</span>
              </div>
            </>
          ) : (
            <>
              <div className="tile">
                <span className="tile__value">{s.correct ? formatSeconds(s.avgMs) : '–'}</span>
                <span className="tile__label">Average time{lesson?.targetMs ? ` (goal ${formatSeconds(lesson.targetMs)})` : ''}</span>
              </div>
              <div className="tile">
                <span className="tile__value">{s.correct ? formatSeconds(s.medianMs) : '–'}</span>
                <span className="tile__label">Median time</span>
              </div>
            </>
          )}
          <div className="tile">
            <span className="tile__value">{s.bestStreak}</span>
            <span className="tile__label">Best streak</span>
          </div>
          <div className="tile">
            <span className="tile__value">{s.missed.length}</span>
            <span className="tile__label">Missed{isRhythm ? (s.timing.miss ? ` (${s.timing.miss} not played)` : '') : s.timeouts ? ` (${s.timeouts} timed out)` : ''}</span>
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
                    {eventLabel(a.prompt.events[a.eventIndex])} ({a.prompt.clef}) →{' '}
                    {a.played.length === 0 ? (isRhythm ? 'not played' : 'timed out') : `played ${a.played.map((m) => midiToName(m)).join('+')}`}
                    {isRhythm && a.timing !== 'miss' && a.timing !== 'none' ? `, ${a.timing}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>

      <footer className="results__footer">
        <button type="button" className="btn" onClick={onBack}>
          {lesson ? 'Back to path' : 'Change settings'}
        </button>
        <button type="button" className={`btn${lesson && stars === 0 ? ' btn--primary' : ''}`} onClick={onPlayAgain}>
          {lesson ? 'Retry' : 'Play again'}
        </button>
        {lesson && nextLesson && stars !== undefined && stars > 0 && onNext && (
          <button type="button" className="btn btn--primary" onClick={onNext}>
            Next: {nextLesson.title} →
          </button>
        )}
        {nextPreset && onLevelUp && (
          <button type="button" className="btn btn--accent" onClick={() => onLevelUp(nextPreset.id)}>
            Try {nextPreset.name} →
          </button>
        )}
      </footer>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { LESSONS } from '../curriculum/lessons';
import type { Progress } from '../curriculum/progress';
import type { Clef } from '../music/difficulty';
import { parseNoteName, spellingFromDiatonic } from '../music/notes';
import { dailyActivity, formatDuration, streaks, totals, type History } from '../state/history';
import type { Mastery, NoteMastery } from '../state/mastery';

interface ProgressPanelProps {
  history: History;
  mastery: Mastery;
  progress: Progress;
  onReset: () => void;
}

/**
 * Accuracy bins for the mastery map. One hue, five ordered steps chosen for the
 * dark panel surface: weaker notes recede toward it, mastered notes stand out.
 */
const BINS = [
  { min: 0.95, label: '95% and up', fill: '#9ec5f4', ink: '#10131a' },
  { min: 0.85, label: '85–94%', fill: '#6da7ec', ink: '#10131a' },
  { min: 0.7, label: '70–84%', fill: '#3987e5', ink: '#10131a' },
  { min: 0.5, label: '50–69%', fill: '#256abf', ink: '#f2f3f7' },
  { min: 0, label: 'Under 50%', fill: '#184f95', ink: '#f2f3f7' },
];
const binFor = (accuracy: number) => BINS.find((b) => accuracy >= b.min) ?? BINS[BINS.length - 1];

const CHART_HEIGHT = 84;

interface Cell {
  name: string;
  stat?: NoteMastery;
}

/** Every staff position between the lowest and highest one practiced, per clef. */
function masteryRows(mastery: Mastery): Array<{ clef: Clef; cells: Cell[] }> {
  return (['treble', 'bass'] as const)
    .map((clef) => {
      const seen = new Map<number, NoteMastery>();
      for (const [key, stat] of Object.entries(mastery)) {
        const [c, name] = key.split(':');
        if (c === clef && stat.asked > 0) seen.set(parseNoteName(name).index, stat);
      }
      if (seen.size === 0) return { clef, cells: [] };
      const indices = [...seen.keys()];
      const cells: Cell[] = [];
      for (let i = Math.min(...indices); i <= Math.max(...indices); i++) {
        const s = spellingFromDiatonic(i);
        cells.push({ name: `${s.letter}${s.octave}`, stat: seen.get(i) });
      }
      return { clef, cells };
    })
    .filter((row) => row.cells.length > 0);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function ProgressPanel({ history, mastery, progress, onReset }: ProgressPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const streak = useMemo(() => streaks(history), [history]);
  const sum = useMemo(() => totals(history), [history]);
  const days = useMemo(() => dailyActivity(history, 14), [history]);
  const rows = useMemo(() => masteryRows(mastery), [mastery]);
  const maxMinutes = Math.max(...days.map((d) => d.minutes), 0);
  const peak = days.reduce((best, d) => (d.minutes > best.minutes ? d : best), days[0]);
  const stars = LESSONS.reduce((s, l) => s + (progress[l.id]?.stars ?? 0), 0);
  const passed = LESSONS.filter((l) => (progress[l.id]?.stars ?? 0) > 0).length;
  const empty = history.length === 0 && rows.length === 0 && stars === 0;

  return (
    <div className="progress">
      <div className="tiles tiles--row">
        <div className="tile">
          <span className="tile__value">{plural(streak.current, 'day')}</span>
          <span className="tile__label">
            Current streak{streak.current > 0 && !streak.practicedToday ? ' · practice today to keep it' : ''}
            {streak.best > streak.current ? ` · best ${streak.best}` : ''}
          </span>
        </div>
        <div className="tile">
          <span className="tile__value">{formatDuration(sum.minutes)}</span>
          <span className="tile__label">Practice time in {plural(sum.sessions, 'session')}</span>
        </div>
        <div className="tile">
          <span className="tile__value">{sum.answered ? pct(sum.accuracy) : '–'}</span>
          <span className="tile__label">Accuracy over {sum.answered.toLocaleString()} answers</span>
        </div>
        <div className="tile">
          <span className="tile__value">
            {passed} / {LESSONS.length}
          </span>
          <span className="tile__label">
            Lessons passed · {stars} of {LESSONS.length * 3} stars
          </span>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel__title">Minutes practiced, last 14 days</h2>
        {maxMinutes === 0 ? (
          <p className="muted">No practice in the last two weeks. Finish a session and it will show up here.</p>
        ) : (
          <div className="columns" role="list" aria-label="Minutes practiced per day">
            {days.map((d) => {
              const height = d.minutes > 0 ? Math.max(3, (d.minutes / maxMinutes) * CHART_HEIGHT) : 0;
              const labelled = d.minutes > 0 && (d.isToday || d.key === peak.key);
              const tip = `${formatDuration(d.minutes)}\n${d.weekday} ${d.date} · ${plural(d.sessions, 'session')}, ${plural(d.answers, 'answer')}`;
              return (
                <div key={d.key} className="columns__slot" role="listitem" tabIndex={0} data-tip={tip} aria-label={`${d.weekday} ${d.date}: ${formatDuration(d.minutes)}`}>
                  <div className="columns__plot" style={{ height: CHART_HEIGHT + 16 }}>
                    {labelled && <span className="columns__value">{formatDuration(d.minutes)}</span>}
                    <div className="columns__bar" style={{ height }} />
                  </div>
                  <span className={`columns__day${d.isToday ? ' columns__day--today' : ''}`}>{d.isToday ? 'Today' : d.weekday}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel">
        <h2 className="panel__title">Note accuracy by staff position</h2>
        {rows.length === 0 ? (
          <p className="muted">Notes you practice appear here, colored by how often you get them right.</p>
        ) : (
          <>
            {rows.map((row) => (
              <div key={row.clef} className="heat">
                <span className="heat__clef muted small">{row.clef === 'treble' ? 'Treble' : 'Bass'}</span>
                <div className="heat__cells" role="list" aria-label={`${row.clef} clef notes, low to high`}>
                  {row.cells.map((cell) => {
                    if (!cell.stat) {
                      return (
                        <div key={cell.name} className="heat__cell heat__cell--empty" role="listitem" tabIndex={0} data-tip={`Not practiced yet\n${cell.name}`} aria-label={`${cell.name}: not practiced yet`}>
                          <span className="heat__name">{cell.name}</span>
                        </div>
                      );
                    }
                    const accuracy = cell.stat.correct / cell.stat.asked;
                    const bin = binFor(accuracy);
                    const avg = cell.stat.correct ? ` · ${seconds(cell.stat.totalMs / cell.stat.correct)} average` : '';
                    return (
                      <div
                        key={cell.name}
                        className="heat__cell"
                        role="listitem"
                        tabIndex={0}
                        style={{ background: bin.fill, color: bin.ink }}
                        data-tip={`${pct(accuracy)} correct\n${cell.name} · ${cell.stat.correct} of ${cell.stat.asked}${avg}`}
                        aria-label={`${cell.name}: ${pct(accuracy)} correct, ${cell.stat.correct} of ${cell.stat.asked}`}
                      >
                        <span className="heat__name">{cell.name}</span>
                        <span className="heat__pct">{pct(accuracy)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="legend" aria-hidden="true">
              <span className="muted small">Accuracy</span>
              {[...BINS].reverse().map((b) => (
                <span key={b.label} className="legend__item small">
                  <span className="legend__swatch" style={{ background: b.fill }} />
                  {b.label}
                </span>
              ))}
              <span className="legend__item small">
                <span className="legend__swatch legend__swatch--empty" />
                Not practiced
              </span>
            </div>
            <details className="details">
              <summary>View as table</summary>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Note</th>
                    <th scope="col">Clef</th>
                    <th scope="col">Correct</th>
                    <th scope="col">Asked</th>
                    <th scope="col">Accuracy</th>
                    <th scope="col">Average time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.flatMap((row) =>
                    row.cells
                      .filter((c) => c.stat)
                      .map((c) => (
                        <tr key={`${row.clef}:${c.name}`}>
                          <th scope="row">{c.name}</th>
                          <td>{row.clef}</td>
                          <td>{c.stat!.correct}</td>
                          <td>{c.stat!.asked}</td>
                          <td>{pct(c.stat!.correct / c.stat!.asked)}</td>
                          <td>{c.stat!.correct ? seconds(c.stat!.totalMs / c.stat!.correct) : '–'}</td>
                        </tr>
                      )),
                  )}
                </tbody>
              </table>
            </details>
          </>
        )}
      </div>

      {!empty && (
        <div className="reset">
          {confirming ? (
            <>
              <span className="small">Erase lesson stars, note accuracy and practice history on this device? Settings are kept.</span>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  setConfirming(false);
                  onReset();
                }}
              >
                Erase everything
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => setConfirming(true)}>
              Reset progress…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

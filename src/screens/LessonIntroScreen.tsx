import { useMemo } from 'react';
import { Staff } from '../components/Staff';
import { unitOf, type Lesson } from '../curriculum/lessons';
import type { Progress } from '../curriculum/progress';
import { promptFromNames } from '../music/generator';
import { describeKey } from '../music/keys';
import { StarRow } from './LearnPath';

interface LessonIntroScreenProps {
  lesson: Lesson;
  progress: Progress;
  onStart: () => void;
  onBack: () => void;
}

function describeConfig(lesson: Lesson): string {
  const c = lesson.config;
  const what =
    c.mode === 'single' ? `${c.noteCount} notes` : c.mode === 'sequence' ? `${c.noteCount} phrases of ${c.sequenceLength}` : c.mode === 'chord' ? `${c.noteCount} chords` : `${c.noteCount} bars at ${c.tempo} bpm`;
  const where = c.clef === 'grand' ? 'grand staff' : `${c.clef} clef`;
  const keys = c.keys.length === 1 && c.keys[0] === 'C' ? '' : c.keys.length === 1 ? `, ${describeKey(c.keys[0])}` : `, ${c.keys.length} keys`;
  const timed = c.timeLimitMs ? `, ${c.timeLimitMs / 1000} s per note` : '';
  return `${what} on the ${where}${keys}${timed}.`;
}

export function LessonIntroScreen({ lesson, progress, onStart, onBack }: LessonIntroScreenProps) {
  const unit = unitOf(lesson);
  const preview = useMemo(() => (lesson.preview ? promptFromNames(lesson.preview.clef, lesson.preview.notes, lesson.preview.key) : null), [lesson]);
  const done = progress[lesson.id];
  const goal = lesson.config.mode === 'rhythm' ? `Get ${Math.round(lesson.mastery * 100)}% of notes on the beat for one star; stay precise for three.` : `Get ${Math.round(lesson.mastery * 100)}% right for one star; ${lesson.targetMs ? `answer within ${(lesson.targetMs / 1000).toFixed(1)} s on average` : 'be accurate'} for three.`;

  return (
    <div className="screen intro">
      <header className="intro__header">
        <button type="button" className="btn btn--ghost" onClick={onBack} aria-label="Back to path">
          ←
        </button>
        <div>
          <p className="muted small">{unit.title}</p>
          <h1 className="intro__title">{lesson.title}</h1>
        </div>
        {done && (
          <div className="intro__best">
            <StarRow stars={done.stars} />
            <span className="muted small">best {Math.round(done.bestAccuracy * 100)}%</span>
          </div>
        )}
      </header>
      <div className="intro__body">
        <div className="intro__text">
          {lesson.intro.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
          {lesson.tip && <p className="tip">💡 {lesson.tip}</p>}
        </div>
        <div className="intro__side">
          {preview && (
            <div className="intro__preview">
              <Staff clefMode={lesson.preview!.clef} prompt={preview} labels />
            </div>
          )}
          <p className="muted small">{describeConfig(lesson)}</p>
          <p className="muted small">{goal}</p>
        </div>
      </div>
      <footer className="intro__footer">
        <button type="button" className="btn btn--primary btn--big" onClick={onStart}>
          {done ? 'Play again' : 'Start lesson'}
        </button>
      </footer>
    </div>
  );
}

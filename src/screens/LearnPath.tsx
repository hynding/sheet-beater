import { UNITS, type Lesson } from '../curriculum/lessons';
import { isUnlocked, nextLesson, unitStars, type Progress } from '../curriculum/progress';

interface LearnPathProps {
  progress: Progress;
  onSelect: (lesson: Lesson) => void;
}

export function StarRow({ stars, size = 'small' }: { stars: number; size?: 'small' | 'big' }) {
  return (
    <span className={`stars stars--${size}`} aria-label={`${stars} of 3 stars`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`star${n <= stars ? ' star--on' : ''}`}>
          ★
        </span>
      ))}
    </span>
  );
}

/** The curriculum as a path of units and lessons with stars and locks. */
export function LearnPath({ progress, onSelect }: LearnPathProps) {
  const next = nextLesson(progress);
  return (
    <div className="path">
      {UNITS.map((unit, ui) => {
        const { earned, possible } = unitStars(unit, progress);
        return (
          <section key={unit.id} className="unit">
            <header className="unit__header">
              <span className="unit__number">{ui + 1}</span>
              <div className="unit__text">
                <h2 className="unit__title">{unit.title}</h2>
                <p className="muted small">{unit.description}</p>
              </div>
              <span className="unit__stars muted small">
                ★ {earned}/{possible}
              </span>
            </header>
            <ol className="lessons">
              {unit.lessons.map((lesson, li) => {
                const unlocked = isUnlocked(lesson.id, progress);
                const stars = progress[lesson.id]?.stars ?? 0;
                const isNext = lesson.id === next.id;
                return (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      className={`lesson${unlocked ? '' : ' lesson--locked'}${isNext ? ' lesson--next' : ''}${stars ? ' lesson--done' : ''}`}
                      disabled={!unlocked}
                      onClick={() => onSelect(lesson)}
                      aria-label={`${lesson.title}${unlocked ? '' : ' (locked)'}`}
                    >
                      <span className="lesson__index">{unlocked ? li + 1 : '🔒'}</span>
                      <span className="lesson__text">
                        <span className="lesson__title">{lesson.title}</span>
                        <span className="lesson__summary muted small">{lesson.summary}</span>
                      </span>
                      {unlocked && <StarRow stars={stars} />}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

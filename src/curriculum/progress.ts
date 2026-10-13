import type { Summary } from '../state/session';
import { LESSONS, type Lesson, type Unit } from './lessons';

export type Stars = 0 | 1 | 2 | 3;

export interface LessonProgress {
  stars: Stars;
  bestAccuracy: number;
  bestAvgMs: number;
  attempts: number;
  lastPlayedAt: number;
}

export type Progress = Record<string, LessonProgress>;

const STORAGE_KEY = 'sheet-beater.progress.v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Progress) : {};
  } catch {
    return {};
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* ignore */
  }
}

/** Stars earned for a session: accuracy unlocks, speed (or timing) polishes. */
export function starsFor(lesson: Lesson, summary: Summary): Stars {
  if (summary.total === 0 || summary.accuracy < lesson.mastery) return 0;
  if (lesson.config.mode === 'rhythm') {
    const judged = summary.total;
    const perfectRatio = judged ? summary.timing.perfect / judged : 0;
    if (summary.accuracy >= 0.95 && perfectRatio >= 0.5) return 3;
    return summary.accuracy >= 0.9 ? 2 : 1;
  }
  const quick = lesson.targetMs === 0 || summary.avgMs <= lesson.targetMs;
  const okSpeed = lesson.targetMs === 0 || summary.avgMs <= lesson.targetMs * 1.75;
  if (summary.accuracy >= 0.95 && quick) return 3;
  if (summary.accuracy >= 0.9 && okSpeed) return 2;
  return 1;
}

/** A lesson is playable once the one before it (in path order) has at least one star. */
export function isUnlocked(lessonId: string, progress: Progress): boolean {
  const i = LESSONS.findIndex((l) => l.id === lessonId);
  if (i <= 0) return i === 0;
  return (progress[LESSONS[i - 1].id]?.stars ?? 0) >= 1;
}

/** The lesson the learner should do next: the first unlocked lesson without a star. */
export function nextLesson(progress: Progress): Lesson {
  return LESSONS.find((l) => (progress[l.id]?.stars ?? 0) === 0 && isUnlocked(l.id, progress)) ?? LESSONS[LESSONS.length - 1];
}

export function lessonAfter(lesson: Lesson): Lesson | undefined {
  const i = LESSONS.findIndex((l) => l.id === lesson.id);
  return LESSONS[i + 1];
}

export function unitStars(unit: Unit, progress: Progress): { earned: number; possible: number } {
  return {
    earned: unit.lessons.reduce((s, l) => s + (progress[l.id]?.stars ?? 0), 0),
    possible: unit.lessons.length * 3,
  };
}

export function recordResult(progress: Progress, lesson: Lesson, summary: Summary, now = Date.now()): { progress: Progress; stars: Stars; improved: boolean } {
  const stars = starsFor(lesson, summary);
  const prev = progress[lesson.id];
  const improved = !prev || stars > prev.stars;
  const next: LessonProgress = {
    stars: Math.max(stars, prev?.stars ?? 0) as Stars,
    bestAccuracy: Math.max(summary.accuracy, prev?.bestAccuracy ?? 0),
    bestAvgMs: prev?.bestAvgMs && prev.bestAvgMs > 0 ? Math.min(prev.bestAvgMs, summary.avgMs || prev.bestAvgMs) : summary.avgMs,
    attempts: (prev?.attempts ?? 0) + 1,
    lastPlayedAt: now,
  };
  return { progress: { ...progress, [lesson.id]: next }, stars, improved };
}

import { describe, expect, it } from 'vitest';
import type { Prompt } from '../music/generator';
import { retryBudget, scheduleRetry } from './retry';

describe('scheduleRetry', () => {
  // Six prompts on six different notes, so placement is deterministic.
  const prompts: Prompt[] = [60, 62, 64, 65, 67, 69].map((midi, id) => ({
    id,
    mode: 'single',
    clef: 'treble',
    key: 'C',
    events: [{ notes: [{ letter: 'C', accidental: '', octave: 4, midi, index: 28 + id }], duration: 'w', beat: 0, rest: false }],
  }));

  it('re-queues a missed prompt two prompts later with a fresh id', () => {
    const next = scheduleRetry(prompts, 1, 3);
    expect(next).toHaveLength(7);
    expect(next[4].retryOf).toBe(prompts[1].id);
    expect(next[4].events).toBe(prompts[1].events);
    expect(new Set(next.map((p) => p.id)).size).toBe(7);
    expect(next.slice(0, 4)).toEqual(prompts.slice(0, 4));
    expect(prompts).toHaveLength(6); // input untouched
  });

  it('slides past a neighbor that asks for the same note', () => {
    const [a, b, c, d] = prompts;
    const list = [a, b, c, { ...a, id: 50 }, d]; // the missed note happens to come up again at index 3
    const next = scheduleRetry(list, 0, 3);
    expect(next.findIndex((p) => p.retryOf === a.id)).toBe(5);
  });

  it('appends when the miss is near the end', () => {
    const next = scheduleRetry(prompts, 5, 3);
    expect(next[6].retryOf).toBe(prompts[5].id);
  });

  it('never retries a retry and respects the budget', () => {
    const once = scheduleRetry(prompts, 0, 1);
    expect(scheduleRetry(once, 3, 1)).toBe(once); // index 3 is the retry itself
    expect(scheduleRetry(once, 1, 1)).toBe(once); // budget of one already spent
    expect(scheduleRetry(once, 1, 2)).toHaveLength(8);
    expect(scheduleRetry(prompts, 99, 3)).toBe(prompts);
  });

  it('scales the budget with session length', () => {
    expect(retryBudget(10)).toBe(3);
    expect(retryBudget(1)).toBe(1);
    expect(retryBudget(30)).toBe(9);
  });
});

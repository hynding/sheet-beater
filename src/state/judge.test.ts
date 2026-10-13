import { describe, expect, it } from 'vitest';
import { chordProgress, isOnTime, judgeTiming } from './judge';

describe('judgeTiming', () => {
  it('classifies offsets', () => {
    expect(judgeTiming(0)).toBe('perfect');
    expect(judgeTiming(-80)).toBe('perfect');
    expect(judgeTiming(150)).toBe('good');
    expect(judgeTiming(-300)).toBe('early');
    expect(judgeTiming(400)).toBe('late');
    expect(isOnTime('good')).toBe(true);
    expect(isOnTime('late')).toBe(false);
  });
});

describe('chordProgress', () => {
  it('accepts keys in any order and fails fast on a wrong key', () => {
    expect(chordProgress([60, 64, 67], [])).toBe('pending');
    expect(chordProgress([60, 64, 67], [64])).toBe('pending');
    expect(chordProgress([60, 64, 67], [67, 60, 64])).toBe('correct');
    expect(chordProgress([60, 64, 67], [60, 65])).toBe('wrong');
  });
});

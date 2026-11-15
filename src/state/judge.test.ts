import { describe, expect, it } from 'vitest';
import { TIMING_WINDOWS, chordProgress, isOnTime, judgeTiming, medianOffset, missDeadline, nearestEvent } from './judge';

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

describe('timing strictness', () => {
  it('widens and narrows the windows', () => {
    expect(judgeTiming(120, TIMING_WINDOWS.relaxed)).toBe('perfect');
    expect(judgeTiming(120, TIMING_WINDOWS.normal)).toBe('good');
    expect(judgeTiming(120, TIMING_WINDOWS.strict)).toBe('good');
    expect(judgeTiming(150, TIMING_WINDOWS.strict)).toBe('late');
    expect(judgeTiming(-250, TIMING_WINDOWS.relaxed)).toBe('good');
    expect(judgeTiming(-250)).toBe('early');
  });
});

describe('medianOffset', () => {
  const clicks = [0, 600, 1200, 1800, 2400, 3000, 3600, 4200];

  it('finds the typical lag and ignores stray and double taps', () => {
    const taps = [70, 655, 1290, 1900, 1930, 2460, 3065, 3990, 4275];
    //            +70 +55  +90  +100 (dup) +60  +65  (stray) +75
    const r = medianOffset(taps, clicks)!;
    expect(r.matched).toBe(7);
    expect(r.offsetMs).toBe(70);
    expect(r.spreadMs).toBeLessThan(40);
  });

  it('handles a player who anticipates the click', () => {
    expect(medianOffset(clicks.map((c) => c - 30), clicks)!.offsetMs).toBe(-30);
  });

  it('needs enough matched taps', () => {
    expect(medianOffset([10, 620, 1210], clicks)).toBeNull();
    expect(medianOffset([], clicks)).toBeNull();
    expect(medianOffset([300, 900, 1500, 2100, 2700], clicks)).toBeNull(); // all half a beat off
  });
});

describe('matching presses to notes', () => {
  const onsets = [0, 1, 2, 3];

  it('credits a press to the nearest unjudged note', () => {
    expect(nearestEvent(onsets, [false, false, false, false], 0.3)).toBe(0); // late for the first note
    expect(nearestEvent(onsets, [false, false, false, false], 0.7)).toBe(1); // early for the second
    expect(nearestEvent(onsets, [true, false, false, false], 0.3)).toBe(1); // first already played
    expect(nearestEvent(onsets, [true, true, true, true], 1)).toBe(-1);
    expect(nearestEvent(onsets, [false, true, false, false], 1.1)).toBe(2); // rests and played notes are skipped
  });

  it('waits for a note until a press would belong to the next one', () => {
    const playable = [true, true, false, true];
    expect(missDeadline(onsets, playable, 0, 4, 0.2)).toBe(0.5);
    expect(missDeadline(onsets, playable, 1, 4, 0.2)).toBe(2); // next note is after the rest
    expect(missDeadline(onsets, playable, 3, 4, 0.2)).toBe(3.5); // last note: half way to the bar end
    expect(missDeadline([0, 0.25, 0.5], [true, true, true], 0, 1, 0.2)).toBe(0.2); // fast notes: never before the window closes
  });
});

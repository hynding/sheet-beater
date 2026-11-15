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
  const clicks = [0, 750, 1500, 2250, 3000, 3750, 4500, 5250];
  const lagged = (ms: number) => clicks.map((c) => c + ms);

  it('finds the typical lag and ignores double taps and gaps', () => {
    const taps = [70, 805, 1590, 2350, 2390, 3060, 3815, 5325];
    //            +70 +55  +90  +100 (dup) +60  +65  (none) +75
    const r = medianOffset(taps, clicks)!;
    expect(r.matched).toBe(7);
    expect(r.offsetMs).toBe(70);
    expect(r.spreadMs).toBeLessThan(40);
  });

  it('handles a player who anticipates the click', () => {
    expect(medianOffset(lagged(-30), clicks)!.offsetMs).toBe(-30);
    expect(medianOffset(lagged(-120), clicks)!.offsetMs).toBe(-120);
  });

  it('measures large delays such as Bluetooth audio without wrapping to the next click', () => {
    for (const delay of [260, 300, 340, 400, 500, 590]) {
      const r = medianOffset(lagged(delay), clicks)!;
      expect(r.offsetMs, `delay ${delay}`).toBe(delay);
      expect(r.matched).toBe(8);
    }
  });

  it('needs enough matched taps', () => {
    expect(medianOffset([10, 760, 1510], clicks)).toBeNull();
    expect(medianOffset([], clicks)).toBeNull();
    expect(medianOffset([100], [0])).toBeNull();
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

  it('leaves a stray press far from any note unassigned', () => {
    expect(nearestEvent(onsets, [true, false, false, false], 0.3, 0.5)).toBe(-1); // 0.7 from the next note
    expect(nearestEvent(onsets, [true, false, false, false], 0.6, 0.5)).toBe(1);
    expect(nearestEvent(onsets, [false, false, false, false], 3.4, 0.5)).toBe(3);
  });

  it('waits for a note until a press would belong to the next one', () => {
    const playable = [true, true, false, true];
    expect(missDeadline(onsets, playable, 0, 4, 0.2)).toBe(0.5);
    expect(missDeadline(onsets, playable, 1, 4, 0.2)).toBe(2); // next note is after the rest
    expect(missDeadline(onsets, playable, 3, 4, 0.2)).toBe(3.5); // last note: half way to the bar end
    expect(missDeadline([0, 0.25, 0.5], [true, true, true], 0, 1, 0.2)).toBe(0.2); // fast notes: never before the window closes
  });

  it('waits longer for input that is reported late', () => {
    // 66 bpm, two eighths then quarters; a microphone reports notes about 142 ms after they sound.
    const spb = 60 / 66;
    const bar = [0, 0.5, 1, 2, 3].map((b) => b * spb);
    const all = bar.map(() => true);
    const played = 0.1; // first note 100 ms late: a good hit
    const reportedAt = played + 0.142;
    expect(reportedAt).toBeGreaterThan(missDeadline(bar, all, 0, 4 * spb, 0.2)); // would have been written off
    expect(reportedAt).toBeLessThan(missDeadline(bar, all, 0, 4 * spb, 0.2, 0.142));
    expect(nearestEvent(bar, bar.map(() => false), reportedAt - 0.142, spb / 2)).toBe(0);
  });
});

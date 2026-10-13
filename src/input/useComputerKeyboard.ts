import { useEffect, useRef, useState } from 'react';

/** Standard DAW-style layout: the home row is white keys, the row above is black keys. */
const KEY_TO_SEMITONE: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16, "'": 17,
};

export interface ComputerKeyboardState {
  /** MIDI pitch that the "a" key currently plays (a C). */
  baseMidi: number;
}

/**
 * Lets the user play with a physical computer keyboard. Z / X shift the
 * octave down / up. Returns the current base octave so the UI can show a hint.
 */
export function useComputerKeyboard(onNoteOn: (midi: number) => void, enabled = true): ComputerKeyboardState {
  const handler = useRef(onNoteOn);
  handler.current = onNoteOn;
  const [baseMidi, setBaseMidi] = useState(60);
  const base = useRef(60);

  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' || key === 'x') {
        base.current = Math.max(24, Math.min(96, base.current + (key === 'z' ? -12 : 12)));
        setBaseMidi(base.current);
        e.preventDefault();
        return;
      }
      const semitone = KEY_TO_SEMITONE[key];
      if (semitone === undefined) return;
      e.preventDefault();
      handler.current(base.current + semitone);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [enabled]);

  return { baseMidi };
}

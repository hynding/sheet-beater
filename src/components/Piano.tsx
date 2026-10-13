import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isBlackKey, midiToName, whiteKeyIndex, whiteKeysBetween, MIDDLE_C } from '../music/notes';
import { useElementSize } from './useElementSize';

export type KeyHighlight = 'pressed' | 'held' | 'correct' | 'wrong' | 'answer';

interface PianoProps {
  low: number;
  high: number;
  onNoteOn: (midi: number) => void;
  highlights?: Partial<Record<number, KeyHighlight>>;
  /** Pitches to print a note name on. */
  labelled?: 'all' | ReadonlySet<number>;
  disabled?: boolean;
}

const MIN_WHITE_KEY_PX = 28;
const BLACK_WIDTH_RATIO = 0.62;
const BLACK_HEIGHT_RATIO = 0.62;

/**
 * An on-screen piano that fills its container. White key width follows the
 * container width and the number of keys; if that would make keys too small
 * to tap, the keyboard keeps a minimum key width and scrolls sideways.
 */
export function Piano({ low, high, onNoteOn, highlights = {}, labelled, disabled = false }: PianoProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(scrollRef);
  const [pressed, setPressed] = useState<number | null>(null);
  const pressedTimer = useRef<number | undefined>(undefined);

  const whiteCount = whiteKeysBetween(low, high);
  const whiteWidth = Math.max(MIN_WHITE_KEY_PX, whiteCount ? width / whiteCount : MIN_WHITE_KEY_PX);
  const totalWidth = whiteWidth * whiteCount;
  const overflow = totalWidth > width + 0.5;
  const firstWhite = whiteKeyIndex(low);

  const keys = useMemo(() => {
    const list: Array<{ midi: number; black: boolean; x: number }> = [];
    for (let midi = low; midi <= high; midi++) {
      const black = isBlackKey(midi);
      const idx = whiteKeyIndex(midi) - firstWhite;
      list.push({ midi, black, x: black ? idx + 1 : idx });
    }
    return list;
  }, [low, high, firstWhite]);

  // When the keyboard scrolls, start with middle C in view.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !overflow) return;
    const centre = (whiteKeyIndex(MIDDLE_C) - firstWhite + 0.5) * whiteWidth;
    el.scrollLeft = Math.max(0, centre - width / 2);
  }, [overflow, whiteWidth, firstWhite, width, low, high]);

  useEffect(() => () => window.clearTimeout(pressedTimer.current), []);

  const press = (midi: number) => {
    if (disabled) return;
    setPressed(midi);
    window.clearTimeout(pressedTimer.current);
    pressedTimer.current = window.setTimeout(() => setPressed(null), 140);
    onNoteOn(midi);
  };

  const blackWidth = whiteWidth * BLACK_WIDTH_RATIO;
  const blackHeight = height * BLACK_HEIGHT_RATIO;

  return (
    <div
      ref={scrollRef}
      className={`piano${overflow ? ' piano--scroll' : ''}`}
      role="group"
      aria-label="Piano keyboard"
    >
      <div className="piano__keys" style={{ width: totalWidth, height }}>
        {keys.map(({ midi, black, x }) => {
          const highlight = highlights[midi] ?? (pressed === midi ? 'pressed' : undefined);
          const showLabel = labelled === 'all' || labelled?.has(midi);
          const style = black
            ? { left: x * whiteWidth - blackWidth / 2, width: blackWidth, height: blackHeight }
            : { left: x * whiteWidth, width: whiteWidth, height };
          return (
            <button
              key={midi}
              type="button"
              className={`key ${black ? 'key--black' : 'key--white'}${highlight ? ` key--${highlight}` : ''}`}
              style={style}
              aria-label={midiToName(midi)}
              disabled={disabled}
              onPointerDown={(e) => {
                e.preventDefault();
                press(midi);
              }}
            >
              {showLabel && <span className="key__label">{midiToName(midi)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useLayoutEffect, useRef } from 'react';
import { Accidental, ModifierContext, Renderer, Stave, StaveConnector, StaveNote, TickContext } from 'vexflow/bravura';
import type { ClefMode } from '../music/difficulty';
import type { Prompt } from '../music/generator';
import { spellingToVexKey } from '../music/notes';
import { useElementSize } from './useElementSize';

export type Feedback = 'none' | 'correct' | 'wrong';

interface StaffProps {
  clefMode: ClefMode;
  prompt: Prompt | null;
  feedback: Feedback;
}

// Logical drawing size; the SVG is scaled to fit whatever space it is given.
const LOGICAL_WIDTH = 260;
const STAVE_X = 20;
const STAVE_WIDTH = 220;
const TREBLE_Y = 10; // top line lands at y + 40 (VexFlow reserves 4 line-spaces above)
const BASS_Y = 120;
const SINGLE_HEIGHT = 140;
const GRAND_HEIGHT = 240;

const COLORS: Record<Feedback, string> = { none: '#1b1b1f', correct: '#1a9f5a', wrong: '#d6453d' };

/**
 * Draws one note on a treble, bass or grand staff with VexFlow.
 * Re-renders from scratch on every change: a single note is cheap to draw.
 */
export function Staff({ clefMode, prompt, feedback }: StaffProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(containerRef);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || width === 0 || height === 0) return;
    host.replaceChildren();

    const logicalHeight = clefMode === 'grand' ? GRAND_HEIGHT : SINGLE_HEIGHT;
    const scale = Math.min(width / LOGICAL_WIDTH, height / logicalHeight);
    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(Math.floor(LOGICAL_WIDTH * scale), Math.floor(logicalHeight * scale));
    const ctx = renderer.getContext();
    ctx.scale(scale, scale);

    const staves: Partial<Record<Prompt['clef'], Stave>> = {};
    if (clefMode === 'treble' || clefMode === 'grand') {
      staves.treble = new Stave(STAVE_X, TREBLE_Y, STAVE_WIDTH).addClef('treble');
    }
    if (clefMode === 'bass' || clefMode === 'grand') {
      staves.bass = new Stave(STAVE_X, clefMode === 'grand' ? BASS_Y : TREBLE_Y, STAVE_WIDTH).addClef('bass');
    }
    for (const stave of Object.values(staves)) stave.setContext(ctx).draw();
    if (staves.treble && staves.bass) {
      new StaveConnector(staves.treble, staves.bass).setType('brace').setContext(ctx).draw();
      new StaveConnector(staves.treble, staves.bass).setType('singleLeft').setContext(ctx).draw();
    }

    const stave = prompt ? staves[prompt.clef] : undefined;
    if (prompt && stave) {
      const note = new StaveNote({ keys: [spellingToVexKey(prompt.spelling)], duration: 'w', clef: prompt.clef });
      if (prompt.spelling.accidental) note.addModifier(new Accidental(prompt.spelling.accidental), 0);
      const color = COLORS[feedback];
      note.setStyle({ fillStyle: color, strokeStyle: color });
      note.setLedgerLineStyle({ fillStyle: color, strokeStyle: color });
      note.setStave(stave).setContext(ctx);

      const mc = new ModifierContext();
      note.addToModifierContext(mc);
      mc.preFormat();
      const tc = new TickContext();
      tc.addTickable(note).preFormat();
      // Centre the note in the space after the clef. The tick x is relative
      // to the stave's note-start x (VexFlow adds that offset when drawing).
      tc.setX((stave.getNoteEndX() - stave.getNoteStartX()) / 2 - 12);
      note.draw();
    }
  }, [clefMode, prompt, feedback, width, height]);

  return (
    <div ref={containerRef} className="staff" data-prompt-midi={prompt?.midi} aria-label={prompt ? `Note on the ${prompt.clef} staff` : 'Empty staff'}>
      <div ref={hostRef} className="staff__svg" />
    </div>
  );
}

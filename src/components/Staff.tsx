import { useEffect, useLayoutEffect, useRef } from 'react';
import { Accidental, Annotation, Beam, Dot, Formatter, ModifierContext, Renderer, Stave, StaveConnector, StaveNote, TickContext, Voice } from 'vexflow/bravura';
import type { ClefMode } from '../music/difficulty';
import { DURATION_BEATS, labelFor, type Prompt } from '../music/generator';
import { spellingToVexKey } from '../music/notes';
import { useElementSize } from './useElementSize';

export type EventState = 'pending' | 'current' | 'correct' | 'wrong';

interface StaffProps {
  clefMode: ClefMode;
  prompt: Prompt | null;
  /** Visual state per event; missing entries are 'pending'. */
  states?: EventState[];
  /** Print note names under the notes (lesson previews). */
  labels?: boolean;
  /** Rhythm mode: cursor position in quarter-note beats from the start of the bar, or null to hide. */
  playheadBeat?: number | null;
}

// Logical drawing size; the SVG is scaled to fit whatever space it is given.
const LOGICAL_WIDTH = 380;
const STAVE_X = 16;
const STAVE_WIDTH = 348;
const TREBLE_Y = 10; // top line lands at y + 40 (VexFlow reserves 4 line-spaces above)
const BASS_Y = 120;
const SINGLE_HEIGHT = 150;
const GRAND_HEIGHT = 250;

const COLORS: Record<EventState, string> = { pending: '#1b1b1f', current: '#2f63e6', correct: '#1a9f5a', wrong: '#d6453d' };
const REST_COLOR = '#55596a';

interface Layout {
  scale: number;
  /** Beat position and logical x of every event start, plus the end of the bar. */
  points: Array<{ beat: number; x: number }>;
}

/**
 * Draws one prompt (a note, a chord, a phrase or a bar) on a treble, bass or
 * grand staff with VexFlow. Re-renders from scratch on every change.
 */
export function Staff({ clefMode, prompt, states = [], labels = false, playheadBeat = null }: StaffProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const { width, height } = useElementSize(containerRef);
  const stateKey = states.join(',');

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || width === 0 || height === 0) return;
    host.replaceChildren();
    layoutRef.current = null;

    const logicalHeight = clefMode === 'grand' ? GRAND_HEIGHT : SINGLE_HEIGHT;
    const scale = Math.min(width / LOGICAL_WIDTH, height / logicalHeight);
    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(Math.floor(LOGICAL_WIDTH * scale), Math.floor(logicalHeight * scale));
    const ctx = renderer.getContext();
    ctx.scale(scale, scale);

    const key = prompt?.key ?? 'C';
    const staves: Partial<Record<Prompt['clef'], Stave>> = {};
    const decorate = (stave: Stave, clef: Prompt['clef']) => {
      stave.addClef(clef);
      if (key !== 'C') stave.addKeySignature(key);
      if (prompt?.timeSignature) stave.addTimeSignature(`${prompt.timeSignature[0]}/${prompt.timeSignature[1]}`);
      return stave;
    };
    if (clefMode === 'treble' || clefMode === 'grand') staves.treble = decorate(new Stave(STAVE_X, TREBLE_Y, STAVE_WIDTH), 'treble');
    if (clefMode === 'bass' || clefMode === 'grand') staves.bass = decorate(new Stave(STAVE_X, clefMode === 'grand' ? BASS_Y : TREBLE_Y, STAVE_WIDTH), 'bass');
    for (const stave of Object.values(staves)) stave.setContext(ctx).draw();
    if (staves.treble && staves.bass) {
      new StaveConnector(staves.treble, staves.bass).setType('brace').setContext(ctx).draw();
      new StaveConnector(staves.treble, staves.bass).setType('singleLeft').setContext(ctx).draw();
    }

    const stave = prompt ? staves[prompt.clef] : undefined;
    if (!prompt || !stave || prompt.events.length === 0) return;

    const notes = prompt.events.map((event, i) => {
      const state = states[i] ?? 'pending';
      const color = event.rest ? REST_COLOR : COLORS[state];
      const sorted = [...event.notes].sort((a, b) => a.index - b.index);
      const keys = event.rest ? [prompt.clef === 'treble' ? 'b/4' : 'd/3'] : sorted.map(spellingToVexKey);
      const duration = event.rest ? event.duration : event.duration;
      const note = new StaveNote({ keys, duration, clef: prompt.clef, autoStem: true });
      sorted.forEach((n, idx) => {
        if (n.accidental) note.addModifier(new Accidental(n.accidental), idx);
      });
      if (duration.includes('d')) Dot.buildAndAttach([note], { all: true });
      if (labels && !event.rest) {
        const annotation = new Annotation(sorted.map(labelFor).join(' '));
        annotation.setFont('system-ui, sans-serif', 11, 'bold');
        annotation.setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
        note.addModifier(annotation, 0);
      }
      note.setStyle({ fillStyle: color, strokeStyle: color });
      note.setLedgerLineStyle({ fillStyle: color, strokeStyle: color });
      note.setStemStyle({ fillStyle: color, strokeStyle: color });
      return note;
    });

    const totalBeats = prompt.events.reduce((s, e) => s + DURATION_BEATS[e.duration], 0);
    const noteStart = stave.getNoteStartX();
    const noteEnd = stave.getNoteEndX();

    if (notes.length === 1) {
      // One note or chord: centre it in the space after the clef and signatures.
      const note = notes[0].setStave(stave).setContext(ctx);
      const mc = new ModifierContext();
      note.addToModifierContext(mc);
      mc.preFormat();
      const tc = new TickContext();
      tc.addTickable(note).preFormat();
      tc.setX((noteEnd - noteStart) / 2 - 12);
      note.draw();
      layoutRef.current = { scale, points: [{ beat: 0, x: note.getAbsoluteX() }, { beat: totalBeats, x: noteEnd }] };
      return;
    }

    const voice = new Voice({ numBeats: Math.max(1, totalBeats), beatValue: 4 }).setMode(Voice.Mode.SOFT).addTickables(notes);
    const beams = prompt.mode === 'rhythm' ? Beam.generateBeams(notes) : [];
    new Formatter().joinVoices([voice]).format([voice], noteEnd - noteStart - 30);
    voice.draw(ctx, stave);
    for (const beam of beams) {
      const color = REST_COLOR;
      beam.setStyle({ fillStyle: color, strokeStyle: color });
      beam.setContext(ctx).draw();
    }
    layoutRef.current = {
      scale,
      points: [...prompt.events.map((e, i) => ({ beat: e.beat, x: notes[i].getAbsoluteX() })), { beat: totalBeats, x: noteEnd }],
    };
  }, [clefMode, prompt, stateKey, labels, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move the playhead without re-rendering the notation.
  useEffect(() => {
    const el = playheadRef.current;
    const layout = layoutRef.current;
    if (!el) return;
    if (playheadBeat === null || !layout) {
      el.style.display = 'none';
      return;
    }
    const pts = layout.points;
    let x = pts[0].x;
    if (playheadBeat >= pts[pts.length - 1].beat) x = pts[pts.length - 1].x;
    else {
      for (let i = 0; i < pts.length - 1; i++) {
        if (playheadBeat >= pts[i].beat && playheadBeat < pts[i + 1].beat) {
          const t = (playheadBeat - pts[i].beat) / (pts[i + 1].beat - pts[i].beat);
          x = pts[i].x + t * (pts[i + 1].x - pts[i].x);
          break;
        }
      }
    }
    el.style.display = 'block';
    el.style.transform = `translateX(${x * layout.scale}px)`;
  }, [playheadBeat, width, height, prompt]);

  const label = prompt ? `${prompt.mode === 'chord' ? 'Chord' : prompt.mode === 'single' ? 'Note' : 'Phrase'} on the ${prompt.clef} staff` : 'Empty staff';
  return (
    <div ref={containerRef} className="staff" data-prompt-midi={prompt?.events[0]?.notes[0]?.midi} aria-label={label}>
      <div className="staff__host">
        <div ref={hostRef} className="staff__svg" />
        <div ref={playheadRef} className="staff__playhead" style={{ display: 'none' }} />
      </div>
    </div>
  );
}

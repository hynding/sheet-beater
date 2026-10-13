import { useEffect, useRef, useState } from 'react';

export interface MidiStatus {
  supported: boolean;
  inputs: string[];
  error: string | null;
}

/**
 * Listens for Note On messages from every connected Web MIDI input.
 * Silently does nothing in browsers without Web MIDI (iOS Safari, for one).
 */
export function useMidiInput(onNoteOn: (midi: number, velocity: number) => void, enabled = true): MidiStatus {
  const handler = useRef(onNoteOn);
  handler.current = onNoteOn;
  const [status, setStatus] = useState<MidiStatus>({ supported: false, inputs: [], error: null });

  useEffect(() => {
    if (!enabled || typeof navigator.requestMIDIAccess !== 'function') return;
    let access: MIDIAccess | null = null;
    let cancelled = false;

    const attach = () => {
      if (!access) return;
      const names: string[] = [];
      access.inputs.forEach((input) => {
        names.push(input.name ?? 'MIDI input');
        input.onmidimessage = (e: MIDIMessageEvent) => {
          const d = e.data;
          if (!d || d.length < 3) return;
          const type = d[0] & 0xf0;
          if (type === 0x90 && d[2] > 0) handler.current(d[1], d[2] / 127);
        };
      });
      setStatus({ supported: true, inputs: names, error: null });
    };

    navigator
      .requestMIDIAccess()
      .then((a) => {
        if (cancelled) return;
        access = a;
        a.onstatechange = attach;
        attach();
      })
      .catch((err: unknown) => {
        if (!cancelled) setStatus({ supported: true, inputs: [], error: err instanceof Error ? err.message : 'MIDI access denied' });
      });

    return () => {
      cancelled = true;
      if (access) {
        access.onstatechange = null;
        access.inputs.forEach((input) => (input.onmidimessage = null));
      }
    };
  }, [enabled]);

  return status;
}

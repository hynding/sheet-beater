import { describe, expect, it } from 'vitest';
import { micButtonLabel, type MicStatus } from './useMicInput';

const status = (state: MicStatus['state'], note: number | null = null): MicStatus => ({ state, note, delayMs: 0 });

describe('micButtonLabel', () => {
  it('is the plain name while the switch is off', () => {
    expect(micButtonLabel(false, status('off'))).toBe('Microphone input');
    expect(micButtonLabel(false, status('listening'))).toBe('Microphone input');
  });

  it('says it is listening without naming each heard note', () => {
    expect(micButtonLabel(true, status('listening'))).toBe('Microphone input: listening');
    expect(micButtonLabel(true, status('listening', 60))).toBe('Microphone input: listening');
  });

  it('carries the reason when the microphone cannot be used', () => {
    expect(micButtonLabel(true, status('denied'))).toBe('Microphone input: Mic blocked: allow it in settings');
    expect(micButtonLabel(true, status('missing'))).toBe('Microphone input: No microphone found');
  });
});

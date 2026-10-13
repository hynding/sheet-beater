import { describe, expect, it } from 'vitest';
import { KEYS, describeKey, keyAccidental } from './keys';

describe('keys', () => {
  it('alters the right letters', () => {
    expect(KEYS.G.altered).toEqual({ F: '#' });
    expect(KEYS.D.altered).toEqual({ F: '#', C: '#' });
    expect(KEYS.E.altered).toEqual({ F: '#', C: '#', G: '#', D: '#' });
    expect(KEYS.F.altered).toEqual({ B: 'b' });
    expect(KEYS.Ab.altered).toEqual({ B: 'b', E: 'b', A: 'b', D: 'b' });
    expect(keyAccidental('Bb', 'E')).toBe('b');
    expect(keyAccidental('Bb', 'A')).toBe('');
  });

  it('describes keys', () => {
    expect(describeKey('C')).toBe('C major, no sharps or flats');
    expect(describeKey('G')).toBe('G major, 1 sharp');
    expect(describeKey('Eb')).toBe('Eb major, 3 flats');
  });
});

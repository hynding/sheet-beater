import { describe, expect, it, vi } from 'vitest';
import { lockLandscape } from './orientation';

describe('lockLandscape', () => {
  it('asks for landscape', () => {
    const lock = vi.fn(() => Promise.resolve());
    lockLandscape({ lock });
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('survives a browser that rejects', async () => {
    lockLandscape({ lock: () => Promise.reject(new Error('NotSupportedError')) });
    await Promise.resolve();
  });

  it('survives a browser that throws instead of rejecting', () => {
    expect(() =>
      lockLandscape({
        lock: () => {
          throw new Error('NotSupportedError');
        },
      }),
    ).not.toThrow();
  });

  it('survives a browser that returns nothing', () => {
    expect(() => lockLandscape({ lock: () => undefined })).not.toThrow();
  });

  it('survives a browser without the feature', () => {
    expect(() => lockLandscape({})).not.toThrow();
    expect(() => lockLandscape(null)).not.toThrow();
  });
});

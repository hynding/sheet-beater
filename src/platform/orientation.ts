interface OrientationLike {
  lock?: (orientation: string) => unknown;
}

/**
 * Asks the browser to hold landscape. This is a nicety that most browsers refuse, and they refuse
 * in different ways: a rejected promise, a thrown error, or no promise at all. None of them may
 * stop whatever the caller does next.
 */
export function lockLandscape(orientation: OrientationLike | null | undefined = window.screen?.orientation as OrientationLike | undefined): void {
  try {
    const result = orientation?.lock?.('landscape');
    if (result instanceof Promise) result.catch(() => undefined);
  } catch {
    /* not supported here */
  }
}

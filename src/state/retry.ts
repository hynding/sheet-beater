import type { Prompt } from '../music/generator';

/**
 * Re-queues a missed prompt a few prompts later so the answer just shown has
 * to be recalled rather than echoed. A retry is never retried itself, and the
 * number of retries per session is capped so a bad run still ends.
 */
export function scheduleRetry(prompts: Prompt[], index: number, maxRetries: number, gap = 2): Prompt[] {
  const missed = prompts[index];
  if (!missed || missed.retryOf !== undefined) return prompts;
  if (prompts.filter((p) => p.retryOf !== undefined).length >= maxRetries) return prompts;
  const nextId = prompts.reduce((max, p) => Math.max(max, p.id), -1) + 1;
  // Slide past neighbours that ask for the same thing, so the retry is not a back-to-back repeat.
  const same = (p: Prompt | undefined) => !!p && p.clef === missed.clef && sameNotes(p, missed);
  let at = Math.min(prompts.length, index + 1 + gap);
  while (at < prompts.length && (same(prompts[at - 1]) || same(prompts[at]))) at++;
  const retry: Prompt = { ...missed, id: nextId, retryOf: missed.retryOf ?? missed.id };
  return [...prompts.slice(0, at), retry, ...prompts.slice(at)];
}

function sameNotes(a: Prompt, b: Prompt): boolean {
  const ids = (p: Prompt) => p.events.map((e) => e.notes.map((n) => n.midi).join('+')).join(' ');
  return ids(a) === ids(b);
}

/** How many retries a session of this size may add. */
export function retryBudget(promptCount: number): number {
  return Math.max(1, Math.ceil(promptCount * 0.3));
}

import { ATTENTION_INTERVAL_MS, ATTENTION_PLAYS } from "@repo/constants";

// Block settings BS3: the attention cadence, as pure functions so the timing
// is tested without a browser. A block plays when it comes into view, then
// every 8 seconds, 3 plays per visit. A play counts only while the block is
// in view. A play that falls due while the block is out of view waits until
// it is back in view, then plays at once.

export type AttentionClock = {
  /** Plays so far this visit (counted under Pause motion and reduced motion too) */
  plays: number;
  /** When the next play is due (ms), or null before the first view */
  dueAt: number | null;
};

export const ATTENTION_START: AttentionClock = { plays: 0, dueAt: null };

export type AttentionStep = {
  clock: AttentionClock;
  /** True when a play happens now */
  play: boolean;
  /** Ms until the next check, or null when nothing is pending (out of view or done) */
  wait: number | null;
};

/** True when the clock has used all its plays. */
export function attentionDone(clock: AttentionClock, cap = ATTENTION_PLAYS): boolean {
  return clock.plays >= cap;
}

/**
 * One tick of the clock at `now`. Call it when the block's view state changes
 * and again after `wait` ms. The first tick in view sets the first play
 * `firstDelay` ms later (0 plays at once; the page waits for the entrance).
 */
export function attentionStep(
  clock: AttentionClock,
  now: number,
  inView: boolean,
  firstDelay = 0,
  interval = ATTENTION_INTERVAL_MS,
  cap = ATTENTION_PLAYS
): AttentionStep {
  if (attentionDone(clock, cap)) return { clock, play: false, wait: null };
  if (!inView) return { clock, play: false, wait: null };
  const dueAt = clock.dueAt ?? now + firstDelay;
  if (now < dueAt) return { clock: { ...clock, dueAt }, play: false, wait: dueAt - now };
  const plays = clock.plays + 1;
  const next: AttentionClock = { plays, dueAt: now + interval };
  return { clock: next, play: true, wait: plays < cap ? interval : null };
}

/** Reads a stored play count (sessionStorage text), clamped to 0 to the cap. */
export function parseStoredPlays(raw: string | null, cap = ATTENTION_PLAYS): number {
  const value = raw === null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(cap, value);
}

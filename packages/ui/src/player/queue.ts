/**
 * Queue, autoplay, sleep timer and gesture rules for the player (Fan Library
 * #26, FL-1, spec 3.5). Pure functions, so the rules that matter for trust run
 * in tests: autoplay never plays an item the viewer can not open, and never
 * leaves the creator whose item just ended.
 */
import type { PlayerItem, QueueEntry, SleepChoice } from "./types";

export const SLEEP_CHOICES: readonly SleepChoice[] = ["off", "end", 15, 30, 60];

/** Previous restarts the item when more than this much has played. */
export const PREVIOUS_RESTART_MS = 3_000;

/** A swipe needs this much travel; less is a tap. */
export const SWIPE_MIN_PX = 48;
const TAP_MAX_PX = 10;
const TAP_MAX_MS = 300;

/** Two taps within this window are a double tap. */
export const DOUBLE_TAP_MS = 300;

export type NextSource = "queue" | "upNext";

export interface NextPick {
  entry: QueueEntry;
  source: NextSource;
  /** Index in the list it came from */
  index: number;
}

function sameOwner(a: PlayerItem, b: PlayerItem): boolean {
  return !!a.ownerId && a.ownerId === b.ownerId;
}

/**
 * What plays after `current`.
 *
 * 1. The viewer's own queue, in order. Locked entries are skipped.
 * 2. Then, only with autoplay on, the page's up next list: the same creator's
 *    items the viewer can open, after the current one in list order (the host
 *    lists newest first), skipping anything already played.
 *
 * Returns null when nothing may play: playback stops.
 */
export function pickNext({
  current,
  queue,
  upNext,
  autoplay,
  played = [],
}: {
  current: PlayerItem | null;
  queue: readonly QueueEntry[];
  upNext: readonly QueueEntry[];
  autoplay: boolean;
  played?: readonly string[];
}): NextPick | null {
  const queued = queue.findIndex(entry => entry.canOpen && entry.item.id !== current?.id);
  if (queued >= 0) return { entry: queue[queued]!, source: "queue", index: queued };
  if (!autoplay || !current) return null;
  const seen = new Set([current.id, ...played]);
  const at = upNext.findIndex(entry => entry.item.id === current.id);
  const ordered = at >= 0 ? [...upNext.slice(at + 1), ...upNext.slice(0, at)] : [...upNext];
  const entry = ordered.find(
    candidate =>
      candidate.canOpen && sameOwner(candidate.item, current) && !seen.has(candidate.item.id)
  );
  if (!entry) return null;
  return { entry, source: "upNext", index: upNext.indexOf(entry) };
}

/**
 * Play next: the entry goes to the front of the queue. A locked entry or the
 * item playing now is refused: the queue comes back unchanged.
 */
export function insertNext(
  queue: readonly QueueEntry[],
  entry: QueueEntry,
  currentId: string | null = null
): QueueEntry[] {
  if (!entry.canOpen || entry.item.id === currentId) return [...queue];
  return [entry, ...queue.filter(other => other.item.id !== entry.item.id)];
}

/** Add to queue: the entry goes to the end, once. Locked entries are refused. */
export function appendToQueue(
  queue: readonly QueueEntry[],
  entry: QueueEntry,
  currentId: string | null = null
): QueueEntry[] {
  if (!entry.canOpen || entry.item.id === currentId) return [...queue];
  if (queue.some(other => other.item.id === entry.item.id)) return [...queue];
  return [...queue, entry];
}

/** Moves one entry; out of range moves are clamped, so a drag past the end lands last. */
export function moveEntry<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list];
  const target = Math.min(Math.max(0, to), list.length - 1);
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved as T);
  return next;
}

/** When the minute choices pause play. Off and end of item have no clock. */
export function sleepEndsAt(choice: SleepChoice, now: number = Date.now()): number | null {
  return typeof choice === "number" ? now + choice * 60_000 : null;
}

/** Whole minutes left, rounded up, so "1 minute" shows until the pause. */
export function sleepMinutesLeft(endsAt: number | null, now: number = Date.now()): number | null {
  if (endsAt == null) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 60_000));
}

export type Swipe = "tap" | "up" | "down" | "left" | "right";

/**
 * Reads a pointer gesture: a short, small movement is a tap; otherwise the
 * longer axis wins once it passes SWIPE_MIN_PX. Anything else is null (a slow
 * drag or a wobble), and nothing happens.
 */
export function classifySwipe(dx: number, dy: number, elapsedMs: number): Swipe | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax <= TAP_MAX_PX && ay <= TAP_MAX_PX && elapsedMs <= TAP_MAX_MS) return "tap";
  if (Math.max(ax, ay) < SWIPE_MIN_PX) return null;
  if (ay >= ax) return dy > 0 ? "down" : "up";
  return dx > 0 ? "right" : "left";
}

/**
 * Where a double tap on the video lands: the left third skips back, the right
 * third skips forward, the middle does nothing more than a single tap.
 */
export function doubleTapSide(x: number, width: number): "back" | "forward" | null {
  if (width <= 0) return null;
  if (x < width / 3) return "back";
  if (x > (width * 2) / 3) return "forward";
  return null;
}

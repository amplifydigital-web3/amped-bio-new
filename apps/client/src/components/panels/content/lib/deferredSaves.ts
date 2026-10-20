/**
 * Saves the item editor could not finish before it closed (offline, or a failed
 * save followed by Back). They live outside React, so leaving the editor never
 * drops an edit: each is sent again when the network returns and every 21 s,
 * up to 8 tries, newest fields winning.
 */
const RETRY_MS = 21_000;
const MAX_TRIES = 8;

type Deferred = { save: (patch: object) => Promise<void>; patch: object; tries: number };

const pending = new Map<string, Deferred>();
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

async function drain() {
  timer = null;
  for (const [key, entry] of [...pending]) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) break;
    try {
      await entry.save(entry.patch);
      if (pending.get(key) === entry) pending.delete(key);
    } catch {
      entry.tries += 1;
      if (entry.tries >= MAX_TRIES) pending.delete(key);
    }
  }
  if (pending.size > 0) timer = setTimeout(() => void drain(), RETRY_MS);
}

/** Keeps a patch for `key` (the item's publicId) and sends it as soon as it can. */
export function deferSave<P extends object>(
  key: string,
  patch: P,
  save: (patch: P) => Promise<void>
) {
  const before = pending.get(key);
  pending.set(key, {
    save: save as (patch: object) => Promise<void>,
    patch: { ...(before?.patch ?? {}), ...patch },
    tries: 0,
  });
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("online", () => void drain());
  }
  if (!timer) timer = setTimeout(() => void drain(), 0);
}

/** Takes back a deferred patch when the editor opens the same item again. */
export function takeDeferred(key: string): object | null {
  const entry = pending.get(key);
  pending.delete(key);
  return entry?.patch ?? null;
}

/** For tests. */
export function deferredCount() {
  return pending.size;
}

/**
 * Autosave for the item editor (spec 3.16 PR 5, cs3 "Autosaved 10:42"). Edits
 * merge into one pending patch, saved 800 ms after the last change, the same
 * delay as the Page and Design editors. One save runs at a time; edits made
 * while it runs go in the next. Offline waits for the network. Leaving the
 * editor hands anything unsaved to deferredSaves, which keeps sending it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { deferSave } from "./deferredSaves";

export const AUTOSAVE_DELAY_MS = 800;

export type AutosaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; at: Date }
  | { state: "error" }
  | { state: "offline" };

export function useAutosave<P extends object>(
  save: (patch: P) => Promise<void>,
  options: { delayMs?: number; isOnline?: () => boolean; deferKey?: string } = {}
) {
  const delay = options.delayMs ?? AUTOSAVE_DELAY_MS;
  const isOnline =
    options.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [status, setStatus] = useState<AutosaveStatus>({ state: "idle" });
  const pending = useRef<Partial<P> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const deferKeyRef = useRef(options.deferKey);
  deferKeyRef.current = options.deferKey;
  const mounted = useRef(true);

  const setIfMounted = (next: AutosaveStatus) => {
    if (mounted.current) setStatus(next);
  };

  const run = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Wait for the running save, then send what piled up behind it
    while (inFlight.current) await inFlight.current;
    const patch = pending.current;
    if (!patch || Object.keys(patch).length === 0) return;
    if (!isOnline()) {
      setIfMounted({ state: "offline" });
      return;
    }
    pending.current = null;
    setIfMounted({ state: "saving" });
    let failed = false;
    const attempt = (async () => {
      try {
        await saveRef.current(patch as P);
        setIfMounted(pending.current ? { state: "saving" } : { state: "saved", at: new Date() });
      } catch {
        failed = true;
        // Keep the failed patch under any newer edits, so Retry sends both
        pending.current = { ...patch, ...(pending.current ?? {}) };
        setIfMounted(isOnline() ? { state: "error" } : { state: "offline" });
      }
    })();
    inFlight.current = attempt;
    try {
      await attempt;
    } finally {
      inFlight.current = null;
    }
    // Edits made during the save go next; a failure waits for Retry or the next edit
    if (pending.current && !failed) scheduleRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), delay);
  }, [delay, run]);
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  /** Queues fields to save. Later values for the same field win. */
  const change = useCallback(
    (patch: Partial<P>) => {
      pending.current = { ...(pending.current ?? {}), ...patch };
      schedule();
    },
    [schedule]
  );

  /** Saves what is pending now. Resolves when it is sent or failed. */
  const flush = useCallback(() => run(), [run]);

  useEffect(() => {
    mounted.current = true;
    const online = () => {
      if (pending.current) void run();
    };
    window.addEventListener("online", online);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", online);
      if (timer.current) clearTimeout(timer.current);
      // Leaving the editor: whatever is not saved yet (a timer, offline, a failed
      // save) goes to the deferred store, which keeps sending it after unmount
      const left = pending.current;
      pending.current = null;
      if (left && Object.keys(left).length > 0) {
        const key = deferKeyRef.current ?? "autosave";
        const send = (patch: P) => saveRef.current(patch);
        // A save still running finishes first, so the newer fields land last
        const inflight = inFlight.current;
        if (inflight) void inflight.finally(() => deferSave(key, left as P, send));
        else deferSave(key, left as P, send);
      }
    };
  }, [run]);

  return { status, change, flush, hasPending: () => pending.current !== null };
}

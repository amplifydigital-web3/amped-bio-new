import { useEffect, useState } from "react";

function secondsUntil(deadline: Date | null) {
  return deadline ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 1000)) : 0;
}

/**
 * Whole seconds until `deadline` (0 once passed). Computed on every render, so
 * a new deadline is right on the first render; a 1 second tick re-renders.
 */
export function useSecondsLeft(deadline: Date | null) {
  const [, setTick] = useState(0);
  const seconds = secondsUntil(deadline);

  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => {
      setTick(n => n + 1);
      if (secondsUntil(deadline) === 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  return seconds;
}

/** 9:41 style, tabular in the UI. */
export function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

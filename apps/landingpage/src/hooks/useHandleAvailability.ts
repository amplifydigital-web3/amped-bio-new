import { useCallback, useEffect, useRef, useState } from "react";
import { trpcClient } from "@/lib/trpc";
import { normalizeHandle, validateHandleFormat, validateHandleLength } from "@/lib/handle";

export type URLStatus =
  | "Unknown"
  | "TooShort"
  | "Invalid"
  | "Checking"
  | "Available"
  | "Unavailable"
  // The check itself did not finish (network); never reported as taken
  | "Error";

/**
 * Debounced handle availability (Screen Review 008 I05). A failed request is
 * "Error" with a recheck, so a network problem never reads as a taken URL.
 */
export function useHandleAvailability(raw: string) {
  const handle = normalizeHandle(raw);
  const [status, setStatus] = useState<URLStatus>("Unknown");
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    if (!handle) return setStatus("Unknown");
    if (!validateHandleLength(handle)) return setStatus("TooShort");
    if (!validateHandleFormat(handle)) return setStatus("Invalid");

    setStatus("Checking");
    const id = ++request.current;
    const timer = setTimeout(() => {
      trpcClient.handle.checkAvailability
        .query({ handle })
        .then(result => {
          if (id === request.current) setStatus(result.available ? "Available" : "Unavailable");
        })
        .catch(() => {
          if (id === request.current) setStatus("Error");
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [handle, attempt]);

  const recheck = useCallback(() => setAttempt(value => value + 1), []);

  return {
    urlStatus: status,
    isValid: validateHandleFormat(handle) && validateHandleLength(handle),
    recheck,
  };
}

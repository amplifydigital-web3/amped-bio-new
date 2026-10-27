import { useEffect, useState } from "react";
import {
  HandleStatus,
  isEquivalentHandle,
  normalizeHandle,
  trpcClient,
  validateHandleFormat,
  validateHandleLength,
} from "@repo/ui";

/** "Error": the availability check itself failed (network or server). */
export type URLStatus = HandleStatus | "Error";

/**
 * Debounced handle availability (Screen Review 020).
 *
 * 020 I02: the current handle is compared ignoring case and before any format
 * check, so a legacy handle with capitals reads as Current, never as an error.
 *
 * @param url The handle as typed (with or without @)
 * @param currentUrl The person's current handle
 */
export function useHandleAvailability(url: string, currentUrl: string = "") {
  const [urlStatus, setUrlStatus] = useState<URLStatus>("Unknown");
  const [attempt, setAttempt] = useState(0);

  const normalizedUrl = normalizeHandle(url).toLowerCase();
  const isCurrentUrl = currentUrl !== "" && isEquivalentHandle(url, currentUrl);
  const isValid = validateHandleFormat(normalizedUrl) && validateHandleLength(normalizedUrl);

  useEffect(() => {
    if (normalizedUrl.trim() === "") {
      setUrlStatus("Unknown");
      return;
    }
    if (isCurrentUrl) {
      setUrlStatus("Current");
      return;
    }
    if (!validateHandleLength(normalizedUrl)) {
      setUrlStatus("TooShort");
      return;
    }
    if (!validateHandleFormat(normalizedUrl)) {
      setUrlStatus("Invalid");
      return;
    }

    setUrlStatus("Checking");
    let cancelled = false;
    const timer = setTimeout(() => {
      trpcClient.handle.checkAvailability
        .query({ handle: normalizedUrl })
        .then(response => {
          if (!cancelled) setUrlStatus(response.available ? "Available" : "Unavailable");
        })
        .catch(() => {
          // A failed check is not a taken URL
          if (!cancelled) setUrlStatus("Error");
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedUrl, isCurrentUrl, attempt]);

  return {
    urlStatus,
    isValid,
    isCurrentUrl,
    /** Run the check again (after an Error) */
    recheck: () => setAttempt(n => n + 1),
  };
}

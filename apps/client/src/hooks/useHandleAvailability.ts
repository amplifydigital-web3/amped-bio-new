import { useState, useEffect, useRef } from "react";
import {
  HandleStatus,
  normalizeHandle,
  validateHandleFormat,
  validateHandleLength,
  isEquivalentHandle,
  checkHandle,
} from "@/utils/handle";

// Re-export the HandleStatus type for backward compatibility
export type URLStatus = HandleStatus;

/**
 * Hook for checking handle availability with debounce
 * @param url The handle to check (with or without @ prefix)
 * @param currentUrl The current user's handle (optional, for comparison)
 */
export function useHandleAvailability(url: string, currentUrl: string = "") {
  const [urlStatus, setUrlStatus] = useState<URLStatus>("Unknown");
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Use the centralized validation functions
  const normalizedUrl = normalizeHandle(url);
  const isValid = validateHandleFormat(normalizedUrl) && validateHandleLength(normalizedUrl);
  const isCurrentUrl = isEquivalentHandle(url, currentUrl) && currentUrl !== "";

  useEffect(() => {
    if (normalizedUrl.trim() === "") {
      setUrlStatus("Unknown");
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

    // Check if URL is the same as current handle
    if (isCurrentUrl) {
      setUrlStatus("Unknown"); // We'll handle this special case in the UI
      return;
    }

    setUrlStatus("Checking");

    // Clear any existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set a new timer
    debounceTimer.current = setTimeout(() => {
      checkHandle(normalizedUrl).then(available => {
        setUrlStatus(available ? "Available" : "Unavailable");
      });
    }, 500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [normalizedUrl, isValid, isCurrentUrl, currentUrl]);

  return {
    urlStatus,
    isValid,
    isCurrentUrl,
  };
}

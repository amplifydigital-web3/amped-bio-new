import { useState, useEffect, useRef } from "react";
import {
  OnelinkStatus,
  normalizeOnelink,
  validateOnelinkFormat,
  validateOnelinkLength,
  isEquivalentOnelink,
  checkOnelink,
} from "@/utils/handle";

// Re-export the OnelinkStatus type for backward compatibility
export type URLStatus = OnelinkStatus;

/**
 * Hook for checking handle availability with debounce
 * @param url The handle to check (with or without @ prefix)
 * @param currentUrl The current user's handle (optional, for comparison)
 */
export function useOnelinkAvailability(url: string, currentUrl: string = "") {
  const [urlStatus, setUrlStatus] = useState<URLStatus>("Unknown");
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Use the centralized validation functions
  const normalizedUrl = normalizeOnelink(url);
  const isValid = validateOnelinkFormat(normalizedUrl) && validateOnelinkLength(normalizedUrl);
  const isCurrentUrl = isEquivalentOnelink(url, currentUrl) && currentUrl !== "";

  useEffect(() => {
    if (normalizedUrl.trim() === "") {
      setUrlStatus("Unknown");
      return;
    }

    if (!validateOnelinkLength(normalizedUrl)) {
      setUrlStatus("TooShort");
      return;
    }

    if (!validateOnelinkFormat(normalizedUrl)) {
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
      checkOnelink(normalizedUrl).then(available => {
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

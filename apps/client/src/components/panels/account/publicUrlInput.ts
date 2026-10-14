import { useEffect, useRef, useState } from "react";
import { cleanHandleInput } from "@repo/ui";
import { publicPageUrl } from "@/components/shell/pageLink";
import { useHandleAvailability, type URLStatus } from "@/hooks/useHandleAvailability";

/** amped.bio/ on production, the environment's host elsewhere. */
export function urlPrefix() {
  return publicPageUrl("").replace(/^https?:\/\//, "");
}

export type UrlLine = { tone: "ok" | "muted" | "error" | "busy"; text: string };

export function statusLine(
  status: URLStatus,
  handle: string,
  showChecking: boolean
): UrlLine | null {
  switch (status) {
    case "Current":
      return { tone: "muted", text: "Your current URL" };
    case "Checking":
      return showChecking ? { tone: "busy", text: "Checking" } : null;
    case "Available":
      return { tone: "ok", text: `${urlPrefix()}${handle} is available` };
    case "Unavailable":
    case "Taken":
      return { tone: "error", text: "That URL is taken. Pick another." };
    case "TooShort":
      return { tone: "error", text: "Use at least 2 characters" };
    case "Invalid":
      return { tone: "error", text: "Use lowercase letters, numbers, hyphens and underscores" };
    case "Error":
      return { tone: "error", text: "Could not check this URL." };
    default:
      return null;
  }
}

/**
 * The typed URL and its live availability check (Screen Review 020). Shared by
 * Account, Public URL and the publish sheet (QA-008), so both read the same.
 */
export function usePublicUrlInput(currentHandle: string) {
  // 020 I02: legacy capitals display as the lowercase URL they resolve to
  const [url, setUrl] = useState(currentHandle.toLowerCase());
  const [cleaned, setCleaned] = useState(false);
  const [showChecking, setShowChecking] = useState(false);
  const cleanedTimer = useRef<ReturnType<typeof setTimeout>>();
  const { urlStatus, isCurrentUrl, recheck } = useHandleAvailability(url, currentHandle);

  // 020 I03: Checking shows only after 400ms
  useEffect(() => {
    if (urlStatus !== "Checking") {
      setShowChecking(false);
      return;
    }
    const timer = setTimeout(() => setShowChecking(true), 400);
    return () => clearTimeout(timer);
  }, [urlStatus]);

  useEffect(() => () => clearTimeout(cleanedTimer.current), []);

  const onInput = (raw: string) => {
    const next = cleanHandleInput(raw);
    // 020 I05: name the rule when cleanup changed what was typed
    if (next !== raw) {
      setCleaned(true);
      clearTimeout(cleanedTimer.current);
      cleanedTimer.current = setTimeout(() => setCleaned(false), 5000);
    }
    setUrl(next);
  };

  return { url, onInput, urlStatus, isCurrentUrl, recheck, cleaned, showChecking };
}

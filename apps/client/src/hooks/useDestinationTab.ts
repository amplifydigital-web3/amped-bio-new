import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";

/**
 * Destination tab state kept in the URL as ?tab= (tabs convention, D02, D29).
 * An unknown value falls back to the first tab and is removed from the URL
 * with replace, so Back does not loop (098 I02).
 */
export function useDestinationTab<T extends string>(tabs: readonly T[]) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const known = (tabs as readonly string[]).includes(raw ?? "");
  const tab = known ? (raw as T) : tabs[0];

  const setTab = useCallback(
    (next: string) => {
      setParams(
        current => {
          const updated = new URLSearchParams(current);
          updated.set("tab", next);
          return updated;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  useEffect(() => {
    if (raw !== null && !known) {
      setParams(
        current => {
          const updated = new URLSearchParams(current);
          updated.delete("tab");
          return updated;
        },
        { replace: true }
      );
    }
  }, [raw, known, setParams]);

  return [tab, setTab] as const;
}

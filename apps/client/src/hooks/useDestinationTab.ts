import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * Destination tab state kept in the URL as ?tab= (tabs convention, D02, D29).
 * Unknown values fall back to the first tab.
 */
export function useDestinationTab<T extends string>(tabs: readonly T[]) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab = (tabs as readonly string[]).includes(raw ?? "") ? (raw as T) : tabs[0];

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

  return [tab, setTab] as const;
}

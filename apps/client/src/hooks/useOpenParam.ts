import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";

/**
 * Deep links from the Home checklist (Screen Review 015 I06): `?open=<name>`
 * runs `onOpen` once and removes the param with a replace navigation, so Back
 * and a reload do not open it again.
 */
export function useOpenParam(name: string, onOpen: () => void) {
  const [params, setParams] = useSearchParams();
  const handled = useRef(false);
  const callback = useRef(onOpen);
  callback.current = onOpen;

  useEffect(() => {
    if (handled.current || params.get("open") !== name) return;
    handled.current = true;
    callback.current();
    setParams(
      current => {
        const next = new URLSearchParams(current);
        next.delete("open");
        return next;
      },
      { replace: true }
    );
  }, [name, params, setParams]);
}

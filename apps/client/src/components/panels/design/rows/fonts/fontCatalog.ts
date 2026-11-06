import { useCallback, useEffect, useState } from "react";
import type { FontCatalog } from "@repo/constants";

// Theme Engine v2 fonts, phase 2b PR 1 (spec 3.8): the catalog loads lazily
// when the Text row opens, once per session, and tile faces load as their
// tiles scroll into view.

let catalogPromise: Promise<FontCatalog> | null = null;

/** Loads catalog.json (about 20 KB gzip) once. A failed load can be retried. */
export function loadFontCatalog(): Promise<FontCatalog> {
  if (!catalogPromise) {
    catalogPromise = import("@repo/constants/src/fonts/catalog.json")
      .then(module => (module.default ?? module) as unknown as FontCatalog)
      .catch(error => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

export type CatalogState =
  | { status: "loading" }
  | { status: "ready"; catalog: FontCatalog }
  | { status: "error"; retry: () => void };

export function useFontCatalog(): CatalogState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadFontCatalog().then(
      catalog => !cancelled && setState({ status: "ready", catalog }),
      () => !cancelled && setState({ status: "error", retry })
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, retry]);

  return state;
}

const loaded = new Set<string>();

/** Adds a font stylesheet to the editor document once. */
export function ensureFontStylesheet(href: string | null) {
  if (!href || loaded.has(href) || typeof document === "undefined") return;
  loaded.add(href);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.fontCatalog = "";
  document.head.appendChild(link);
}

/** Calls back once when the element first scrolls near the viewport. */
export function useNearViewport<T extends Element>(): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!node || near) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, near]);
  return [setNode, near];
}

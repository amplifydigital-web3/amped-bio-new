"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Theme Engine v2 phase 3c: what the page's showcase engines may do, for the
 * parts that render deep inside the page (the button's Click spark, the
 * name's Fuzzy text). CreatorPage provides it; outside a page the default
 * keeps every effect still.
 */
export interface ShowcaseState {
  /** The themeShowcase flag: canvas and WebGL engines may run. */
  showcase: boolean;
  /** Pause motion. */
  paused: boolean;
  device?: "strong" | "typical" | "weak";
}

const ShowcaseContext = createContext<ShowcaseState>({ showcase: false, paused: false });

export function ShowcaseProvider({
  value,
  children,
}: {
  value: ShowcaseState;
  children: ReactNode;
}) {
  return <ShowcaseContext.Provider value={value}>{children}</ShowcaseContext.Provider>;
}

export function useShowcase(): ShowcaseState {
  return useContext(ShowcaseContext);
}

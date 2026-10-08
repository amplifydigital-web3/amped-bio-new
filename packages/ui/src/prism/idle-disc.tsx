"use client";

import { useRef, type ReactNode } from "react";
import { useOffscreenPause } from "./motion";

/** The 55 status disc with one slow idle loop that pauses off screen (Build Board #26). */
export function IdleDisc({ children }: { children: ReactNode }) {
  const disc = useRef<HTMLSpanElement>(null);
  useOffscreenPause(disc);
  return (
    <span ref={disc} className="prism-disc prism-idle" aria-hidden>
      {children}
    </span>
  );
}

"use client";

import { Pause, Play } from "lucide-react";
import { Button } from "@repo/ui";
import { usePausedChoice } from "./motionState";

/**
 * Pause motion on the landing page (Build Board #26, section 3.7). Stops the
 * hero light and the How it works scenes, and keeps the choice for creator
 * pages too (same key as 041 I02).
 */
export function PauseMotionButton() {
  const [paused, setPaused] = usePausedChoice();
  return (
    <Button variant="ghost" aria-pressed={paused} onClick={() => setPaused(!paused)}>
      {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
      {paused ? "Play motion" : "Pause motion"}
    </Button>
  );
}

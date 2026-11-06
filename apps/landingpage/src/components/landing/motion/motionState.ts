"use client";

// Moved to packages/ui/src/motion/motionState.ts (Theme Engine v2 phase 1b,
// spec 3.7) so the creator page shares the landing control. Re-exported here
// so the landing imports keep working.
export { readMotionPaused, setMotionPaused, useMotionOff, usePausedChoice } from "@repo/ui";

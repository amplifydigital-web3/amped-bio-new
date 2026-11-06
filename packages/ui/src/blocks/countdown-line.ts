import { countdownLine } from "@repo/constants";

// The text under a countdown row (CD1). Whole days, then hours, then
// minutes. Never seconds.

/** The line once the start has passed. The page does not reload by itself. */
export const OPENS_NOW_LINE = "Opens now. Refresh the page.";

/** The line under the row at `now` in the visitor's zone. */
export function countdownRowLine(start: string, now: Date, visitorZone?: string): string {
  const startMs = Date.parse(start);
  if (!Number.isFinite(startMs) || now.getTime() >= startMs) return OPENS_NOW_LINE;
  return countdownLine(start, now, visitorZone);
}

import { blockVisibility, scheduledBlockDto, type ScheduledBlockDto } from "@repo/constants";

/**
 * Block settings server rule (Block Review v2 B0, BS1 and CD2): which block
 * rows may leave the server for a visitor. Hidden, expired and not yet live
 * blocks are dropped here, before any response, page HTML, data payload or
 * preview is built, so their URL, text and file ids never reach a visitor.
 * A block before go live with Show a countdown leaves only as the countdown
 * row: label and start, nothing else.
 *
 * Saved schedules apply whether the blocksV2 flag is on or off, so a block
 * never shows early because a flag changed.
 */
export function visibleBlockRows<T extends { id: number; type: string; order: number; config: unknown }>(
  rows: readonly T[],
  now: Date = new Date()
): { shown: T[]; countdowns: ScheduledBlockDto[] } {
  const shown: T[] = [];
  const countdowns: ScheduledBlockDto[] = [];
  for (const row of rows) {
    const visibility = blockVisibility(row, now);
    if (visibility === "show") shown.push(row);
    else if (visibility === "countdown") {
      const dto = scheduledBlockDto(row);
      if (dto) countdowns.push(dto);
    }
  }
  return { shown, countdowns };
}

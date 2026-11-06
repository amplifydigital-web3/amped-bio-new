/** Chapter rows in the item editor (cs3) and the shape content.update saves. */
import { formatDuration, parseTimecode } from "./files";

export type Chapter = { startMs: number; title: string };
export type ChapterRow = { key: number; start: string; title: string };

let rowKey = 0;

/** A key for a new chapter row. */
export function nextRowKey() {
  return ++rowKey;
}

export function toRows(chapters: unknown): ChapterRow[] {
  if (!Array.isArray(chapters)) return [];
  return (chapters as Chapter[]).map(c => ({
    key: ++rowKey,
    start: formatDuration(c.startMs) ?? "0:00",
    title: c.title,
  }));
}

/** Rows to the saved shape, or null when a row is not complete yet. */
export function rowsToChapters(rows: ChapterRow[]): Chapter[] | null {
  const out: Chapter[] = [];
  for (const row of rows) {
    const startMs = parseTimecode(row.start);
    const title = row.title.trim();
    if (startMs === null || !title) return null;
    out.push({ startMs, title: title.slice(0, 100) });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

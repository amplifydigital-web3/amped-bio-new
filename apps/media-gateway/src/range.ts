/**
 * Single range parsing for `Range: bytes=...`. Browsers send one range for audio,
 * video and PDF viewers. A multi range or malformed header is ignored and the
 * whole object is served, as RFC 9110 allows.
 */
export type ByteRange = { offset: number; length?: number } | { suffix: number };

export function parseRange(header: string | null): ByteRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, start, end] = match as unknown as [string, string, string];
  if (start === "" && end === "") return null;
  if (start === "") {
    const suffix = Number(end);
    return suffix > 0 ? { suffix } : null;
  }
  const offset = Number(start);
  if (!Number.isSafeInteger(offset)) return null;
  if (end === "") return { offset };
  const last = Number(end);
  if (!Number.isSafeInteger(last) || last < offset) return null;
  return { offset, length: last - offset + 1 };
}

/** Resolves a range against the object size. Null when it cannot be satisfied. */
export function resolveRange(
  range: ByteRange,
  size: number
): { offset: number; length: number } | null {
  if (size === 0) return null;
  if ("suffix" in range) {
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }
  if (range.offset >= size) return null;
  const length = Math.min(range.length ?? size - range.offset, size - range.offset);
  return { offset: range.offset, length };
}

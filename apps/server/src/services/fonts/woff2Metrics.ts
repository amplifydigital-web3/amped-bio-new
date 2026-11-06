import { brotliDecompressSync } from "zlib";

/**
 * Theme Engine v2 fonts, phase 2b PR 2 (spec 3.8): the vertical and width
 * metrics of a WOFF2 file, for the metric matched fallback face. WOFF2 stores
 * every table in one Brotli stream; head, hhea and OS/2 are never transformed,
 * so they read as plain sfnt tables once the stream is decompressed.
 * Format: https://www.w3.org/TR/WOFF2/ (5.1 header, 5.2 table directory).
 */

export interface FontMetrics {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lineGap: number;
  xAvgCharWidth: number;
}

// Known table tags by flag index (WOFF2 5.2); only the indexes this reader needs
const KNOWN: Record<number, string> = { 1: "head", 2: "hhea", 6: "OS/2", 10: "glyf", 11: "loca" };

function base128(view: DataView, offset: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = view.getUint8(offset + i);
    if (i === 0 && byte === 0x80) throw new Error("woff2: leading zero in UIntBase128");
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value, offset + i + 1];
  }
  throw new Error("woff2: UIntBase128 longer than 5 bytes");
}

/** Reads the metrics from a WOFF2 file, or null when it is not one this reader can parse. */
export function woff2Metrics(file: Uint8Array): FontMetrics | null {
  try {
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    if (view.getUint32(0) !== 0x774f4632) return null; // "wOF2"
    if (view.getUint32(4) === 0x74746366) return null; // collections are not used here
    const numTables = view.getUint16(12);
    const totalCompressedSize = view.getUint32(20);
    let offset = 48;
    const tables: { tag: string; length: number }[] = [];
    for (let i = 0; i < numTables; i++) {
      const flags = view.getUint8(offset++);
      const index = flags & 0x3f;
      let tag = KNOWN[index] ?? `#${index}`;
      if (index === 0x3f) {
        tag = String.fromCharCode(
          view.getUint8(offset),
          view.getUint8(offset + 1),
          view.getUint8(offset + 2),
          view.getUint8(offset + 3)
        );
        offset += 4;
      }
      const version = (flags >> 6) & 3;
      let length: number;
      [length, offset] = base128(view, offset);
      const glyfOrLoca = tag === "glyf" || tag === "loca";
      if ((glyfOrLoca && version === 0) || (!glyfOrLoca && version !== 0)) {
        [length, offset] = base128(view, offset);
      }
      tables.push({ tag, length });
    }
    const stream = brotliDecompressSync(file.subarray(offset, offset + totalCompressedSize));
    const data = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
    const at: Record<string, number> = {};
    let cursor = 0;
    for (const table of tables) {
      at[table.tag] = cursor;
      cursor += table.length;
    }
    const head = at["head"];
    const hhea = at["hhea"];
    const os2 = at["OS/2"];
    if (head === undefined || hhea === undefined || os2 === undefined) return null;
    const unitsPerEm = data.getUint16(head + 18);
    if (!unitsPerEm) return null;
    return {
      unitsPerEm,
      ascender: data.getInt16(hhea + 4),
      descender: data.getInt16(hhea + 6),
      lineGap: data.getInt16(hhea + 8),
      xAvgCharWidth: data.getInt16(os2 + 2),
    };
  } catch {
    return null;
  }
}

/** The local fonts a fallback face sizes, by catalog category, with their OS/2 metrics. */
const LOCAL: Record<"serif" | "sans" | "mono", { name: string; avg: number; upm: number }> = {
  serif: { name: "Times New Roman", avg: 821, upm: 2048 },
  mono: { name: "Courier New", avg: 1229, upm: 2048 },
  sans: { name: "Arial", avg: 904, upm: 2048 },
};

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

/**
 * An @font-face rule for "<Family> Fallback": a local font scaled to the
 * family's average width, with its ascent, descent and line gap, so the swap
 * to the real font moves the text as little as possible.
 */
export function fallbackFace(
  family: string,
  metrics: FontMetrics,
  kind: "serif" | "sans" | "mono" = "sans"
): string {
  const local = LOCAL[kind];
  const sizeAdjust = metrics.xAvgCharWidth / metrics.unitsPerEm / (local.avg / local.upm);
  const scale = metrics.unitsPerEm * sizeAdjust;
  return [
    `@font-face{font-family:"${family} Fallback"`,
    `src:local("${local.name}")`,
    `size-adjust:${pct(sizeAdjust)}`,
    `ascent-override:${pct(metrics.ascender / scale)}`,
    `descent-override:${pct(Math.abs(metrics.descender) / scale)}`,
    `line-gap-override:${pct(metrics.lineGap / scale)}}`,
  ].join(";");
}

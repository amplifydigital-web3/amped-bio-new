/**
 * JSON for Redis that keeps types: bigints and dates are tagged so a cached
 * read returns the same types as a fresh one (#210). An all digit string, such
 * as a pool named "2025", stays a string.
 */
export function encodeCached(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, v) {
    const raw = this[key];
    if (typeof raw === "bigint") return { $bigint: raw.toString() };
    if (raw instanceof Date) return { $date: raw.toISOString() };
    return v;
  });
}
export function decodeCached<T>(text: string): T {
  return JSON.parse(text, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (typeof v.$bigint === "string" && Object.keys(v).length === 1) return BigInt(v.$bigint);
      if (typeof v.$date === "string" && Object.keys(v).length === 1) return new Date(v.$date);
    }
    return v;
  }) as T;
}

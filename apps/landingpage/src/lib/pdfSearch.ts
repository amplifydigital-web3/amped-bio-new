/** Search in a document (Fan Library FL-1, board m8). Pure, so it runs in tests. */

/** Pages whose text holds every word of the query, in page order (FL-1, board m8). */
export function matchingPages(texts: string[], query: string): number[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const pages: number[] = [];
  texts.forEach((text, index) => {
    const lower = text.toLowerCase();
    if (words.every(word => lower.includes(word))) pages.push(index + 1);
  });
  return pages;
}

// HTML entity decoding for text that WordPress returns already encoded, such as
// title.rendered ("What&#8217;s new") and excerpt.rendered (Screen Review
// 072 I10). One helper serves the index, the post page, metadata and the /og
// title, so an apostrophe reads the same everywhere.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  times: "×",
  colon: ":",
  sol: "/",
  lpar: "(",
  rpar: ")",
  period: ".",
  comma: ",",
  tab: "\t",
  newline: "\n",
};

function fromCodePoint(code: number): string {
  // Invalid or surrogate code points become the replacement character
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
    return "�";
  }
  return String.fromCodePoint(code);
}

/** Decode named and numeric HTML entities. Unknown names are left as written. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1] === "x" || entity[1] === "X";
      return fromCodePoint(parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    // Named entities need their semicolon, except the common legacy ones
    if (named === undefined) return match;
    if (
      !match.endsWith(";") &&
      !["amp", "lt", "gt", "quot", "nbsp"].includes(entity.toLowerCase())
    ) {
      return match;
    }
    return named;
  });
}

/** Plain text from rendered HTML: tags removed, entities decoded, spaces collapsed. */
export function htmlToText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

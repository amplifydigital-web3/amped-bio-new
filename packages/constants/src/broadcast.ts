/**
 * Creator Pool Broadcast (Build Board #1), shared by server and client.
 * Spec: docs/features/creator-pool-broadcast.md, sections 3.4 and 3.8.
 *
 * Rob, 2026-10-04: flagged language warns the creator and does not hold the
 * broadcast. The product team owns this word list.
 */

export const BROADCAST_LIMITS = {
  titleMax: 120,
  bodyMax: 5000,
  linksMax: 5,
  perDay: 3,
  perWeek: 10,
} as const;

export type BroadcastFlagCategory = "yield" | "returns" | "price" | "investment" | "solicitation";

/** One list for product copy, templates, creator broadcasts and marketing. */
export const BROADCAST_BANNED_TERMS: Record<BroadcastFlagCategory, readonly string[]> = {
  yield: ["apy", "apr", "yield", "passive income", "rewards grow"],
  returns: ["roi", "returns", "profit", "earn", "guaranteed", "double your"],
  price: ["price target", "to the moon", "10x", "pump", "going up"],
  investment: ["invest", "investment", "investors", "dividend"],
  solicitation: ["buy revo", "stake more", "add to your stake"],
};

/** Words the composer suggests next to a flag. */
export const BROADCAST_ALTERNATIVES = [
  "member",
  "membership",
  "join",
  "back",
  "support",
  "community update",
  "member access",
  "members of my pool",
] as const;

/** Shown in the composer and linked from the report flow. Exempt from the copy check. */
export const BROADCAST_POLICY =
  "Broadcasts are for updates about your work and your community. Do not promote rewards, yield, returns, prices or price predictions. Do not describe staking or REVO as an investment. Do not tell members to buy, hold or stake more. Amped holds or removes broadcasts that break this policy and can pause your broadcasting.";

/** Fixed footer on every inbox message and email. The creator cannot edit it. */
export function BROADCAST_FOOTER(creatorName: string) {
  return `${creatorName} wrote this message. Amped.Bio delivers it and does not endorse it. Nothing in a broadcast is financial advice.`;
}

export const BROADCAST_REPORT_REASONS = [
  { value: "FINANCIAL_PROMISE", label: "Promises money or returns" },
  { value: "SPAM", label: "Spam" },
  { value: "HARASSMENT", label: "Harassment" },
  { value: "OTHER", label: "Something else" },
] as const;

export type BroadcastReportReasonValue = (typeof BROADCAST_REPORT_REASONS)[number]["value"];

/** Pause thresholds on a single broadcast (section 3.8). */
export const BROADCAST_PAUSE_RULES = {
  reportShare: 0.01,
  reportMin: 3,
  rejectionsIn30Days: 2,
} as const;

export interface BroadcastFlag {
  phrase: string;
  category: BroadcastFlagCategory;
  field: "title" | "body";
  start: number;
  end: number;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TERM_PATTERNS: { term: string; category: BroadcastFlagCategory; re: RegExp }[] =
  Object.entries(BROADCAST_BANNED_TERMS).flatMap(([category, terms]) =>
    terms.map(term => ({
      term,
      category: category as BroadcastFlagCategory,
      // Word boundaries on letters and digits; spaces in a phrase match any run of whitespace
      re: new RegExp(
        `(?<![\\p{L}\\p{N}])${term.split(" ").map(escapeRegExp).join("\\s+")}(?![\\p{L}\\p{N}])`,
        "giu"
      ),
    }))
  );

/** Case insensitive, word boundary match after Unicode normalization. */
export function findBannedTerms(
  text: string
): { phrase: string; category: BroadcastFlagCategory; start: number; end: number }[] {
  const normalized = text.normalize("NFKC");
  const hits: { phrase: string; category: BroadcastFlagCategory; start: number; end: number }[] =
    [];
  for (const { term, category, re } of TERM_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized))) {
      hits.push({ phrase: term, category, start: m.index, end: m.index + m[0].length });
    }
  }
  // Drop a match that sits inside a longer match, so one phrase is flagged once
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  return hits.filter(
    (h, i) =>
      !hits.some(
        (o, j) =>
          j !== i && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start
      )
  );
}

export function checkBroadcastContent(title: string, body: string): BroadcastFlag[] {
  return [
    ...findBannedTerms(title).map(h => ({ ...h, field: "title" as const })),
    ...findBannedTerms(body).map(h => ({ ...h, field: "body" as const })),
  ];
}

// Markdown subset: **bold**, _italic_ or *italic*, [text](https://url), line breaks.
// Everything else is plain text. No HTML, images or scripts.

export type BroadcastInline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "link"; text: string; href: string };

export type BroadcastParagraph = BroadcastInline[][]; // lines in a paragraph

const INLINE_RE =
  /\*\*([^*\n]+)\*\*|(?:_([^_\n]+)_|\*([^*\n]+)\*)|\[([^\]\n]{1,200})\]\((https:\/\/[^\s)]{1,2000})\)/g;

export function parseBroadcastInline(line: string): BroadcastInline[] {
  const out: BroadcastInline[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(line))) {
    if (m.index > last) out.push({ type: "text", text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: "bold", text: m[1] });
    else if (m[2] !== undefined || m[3] !== undefined)
      out.push({ type: "italic", text: (m[2] ?? m[3])! });
    else if (m[4] !== undefined && m[5] !== undefined)
      out.push({ type: "link", text: m[4], href: m[5] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ type: "text", text: line.slice(last) });
  return out;
}

/** Paragraphs split on blank lines; single line breaks are kept inside a paragraph. */
export function parseBroadcastBody(body: string): BroadcastParagraph[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => p.split("\n").map(parseBroadcastInline));
}

/** Every link target in the body, including bare text that looks like a link target. */
export function broadcastLinks(body: string): string[] {
  return parseBroadcastBody(body)
    .flat(2)
    .filter((t): t is Extract<BroadcastInline, { type: "link" }> => t.type === "link")
    .map(t => t.href);
}

/** Plain text preview for lists and the inbox row. */
export function broadcastPlainText(body: string): string {
  return parseBroadcastBody(body)
    .map(p => p.map(line => line.map(t => t.text).join("")).join(" "))
    .join(" ");
}

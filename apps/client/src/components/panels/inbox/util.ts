import { MESSAGE_UI } from "@repo/constants";

/** One key per send attempt, reused when the same text is retried (spec 7.2). */
export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The message of a tRPC error when the server sent product copy, else the fallback. */
export function errorMessage(error: unknown, fallback: string) {
  const data = (error as { data?: { code?: string } } | null)?.data;
  const message = (error as Error | null)?.message;
  const productCodes = [
    "FORBIDDEN",
    "PRECONDITION_FAILED",
    "BAD_REQUEST",
    "TOO_MANY_REQUESTS",
    "NOT_FOUND",
  ];
  return data?.code && productCodes.includes(data.code) && message ? message : fallback;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Row time: "9:12 AM" today, "Yesterday", "Sep 30" this year, "Sep 30, 2025" before. */
export function rowTime(value: string | Date) {
  const d = new Date(value);
  const now = new Date();
  if (sameDay(d, now)) return clock(d);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return MESSAGE_UI.yesterday;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function clock(value: string | Date) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Day label above a run of messages. */
export function dayLabel(value: string | Date) {
  const d = new Date(value);
  const now = new Date();
  if (sameDay(d, now)) return MESSAGE_UI.today;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return MESSAGE_UI.yesterday;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function dayKey(value: string | Date) {
  return new Date(value).toDateString();
}

/** "@handle", or the name when the account has no handle. */
export function atHandle(person: { name: string; handle: string | null } | null) {
  if (!person) return MESSAGE_UI.deletedAccount;
  return person.handle ? `@${person.handle}` : person.name;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

/** Split text into plain parts and links; a request shows links as plain text. */
export function linkParts(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    // A sentence end is not part of the link
    const raw = match[0].replace(/[.,;:!?)]+$/, "");
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: raw, href: raw });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

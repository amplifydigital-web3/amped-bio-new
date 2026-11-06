import { Lock } from "lucide-react";
import type { RouterOutputs } from "@repo/ui";
import { WordBadge } from "../../kit/WordBadge";
import { formatDay } from "../../kit/format";

// Reserved handles admin (Build Board D2, spec 7). Shared types, labels and
// badges for the Handles destination and the Users slab.

export type WordRow = RouterOutputs["admin"]["handles"]["list"]["items"][number];
export type WordDetail = RouterOutputs["admin"]["handles"]["get"];
export type HolderRow = RouterOutputs["admin"]["handles"]["holders"]["list"]["items"][number];
export type RedirectRow = RouterOutputs["admin"]["handles"]["redirects"]["list"]["items"][number];
export type LogRow = RouterOutputs["admin"]["handles"]["log"]["list"]["items"][number];
export type Category = "COMPANY" | "TRUST" | "BRAND" | "PARTNER" | "HOLD";
export type Kind = "EXACT" | "PREFIX";
export type HolderAction = "keep" | "notice";

export const CATEGORY_LABELS: Record<Category, string> = {
  COMPANY: "Company",
  TRUST: "Trust",
  BRAND: "Brand",
  PARTNER: "Partner",
  HOLD: "Hold",
};

export const CATEGORIES: Category[] = ["COMPANY", "TRUST", "BRAND", "PARTNER", "HOLD"];

/** Default for an account that holds a newly reserved word (decision A2) */
export function defaultAction(category: Category): HolderAction {
  return category === "COMPANY" || category === "TRUST" ? "notice" : "keep";
}

/** Tier and category: System with a lock in ink, or the category in nav (spec 7.2) */
export function TierBadge({ row }: { row: Pick<WordRow, "tier" | "category"> }) {
  if (row.tier === "system") {
    return (
      <WordBadge tone="ink" dot={false}>
        <Lock aria-hidden className="h-[13px] w-[13px]" strokeWidth={2} />
        System
      </WordBadge>
    );
  }
  return <WordBadge tone="nav">{CATEGORY_LABELS[row.category as Category]}</WordBadge>;
}

/** Status: Reserved in ink, Assigned in success, Ends {date} in warning (spec 7.2) */
export function StatusBadge({ row }: { row: Pick<WordRow, "status" | "expiresAt"> }) {
  if (row.status === "assigned") return <WordBadge tone="success">Assigned</WordBadge>;
  if (row.status === "ends") {
    return <WordBadge tone="warning">Ends {formatDay(row.expiresAt)}</WordBadge>;
  }
  return <WordBadge tone="ink">Reserved</WordBadge>;
}

export function PrefixTag() {
  return (
    <WordBadge tone="neutral" className="ml-2">
      Prefix
    </WordBadge>
  );
}

/** Plain causes by error code, never the raw server text, except our own sentences. */
export function causeOf(error: unknown, fallback?: string): string {
  const data = (error as { data?: { code?: string } })?.data;
  const message = (error as { message?: string })?.message ?? "";
  switch (data?.code) {
    case "BAD_REQUEST":
    case "CONFLICT":
    case "NOT_FOUND":
      // admin.handles writes plain sentences for these (spec 7.3 to 7.5)
      return message || fallback || "The server did not accept this change.";
    case "UNAUTHORIZED":
    case "FORBIDDEN":
      return "Your session ended. Sign in again, then retry.";
    case "TOO_MANY_REQUESTS":
      return "Too many changes at once. Wait a minute, then try again.";
    default:
      return fallback ?? "The server did not answer. Check your connection, then try again.";
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 11 Nov */
export function shortDay(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Whole days from now until `value`, at least 0 */
export function daysUntil(value: string | Date | null | undefined): number {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

/** "Published, 41 followers" */
export function pageLine(account: { pageStatus: string; followers: number }): string {
  const page = account.pageStatus === "PUBLISHED" ? "Published" : "Not published";
  const followers = `${account.followers.toLocaleString("en-US")} ${
    account.followers === 1 ? "follower" : "followers"
  }`;
  return account.pageStatus === "PUBLISHED" ? `${page}, ${followers}` : page;
}

/** "signed in 3 days ago" */
export function signedInLine(value: string | Date | null | undefined): string {
  if (!value) return "never signed in";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "signed in today";
  if (days === 1) return "signed in yesterday";
  return `signed in ${days} days ago`;
}

/** Handle rules from @repo/constants, repeated for the form (spec 7.3) */
export const WORD_PATTERN = /^[a-z0-9_-]+$/;

export function normalizeWord(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/** The as typed check for the Word field; the server checks again */
export function wordError(word: string, kind: Kind): string | undefined {
  if (!word) return undefined;
  if (!WORD_PATTERN.test(word)) return "Use only a to z, 0 to 9, - and _.";
  if (kind === "PREFIX") {
    const letters = word.slice(0, -1).replace(/[^a-z0-9]/g, "").length;
    if (!/[-_]$/.test(word) || letters < 3 || !/^[a-z0-9]/.test(word)) {
      return "A prefix needs 3 or more letters or digits, then - or _. For example amp- or amp_.";
    }
  } else if (word.length < 2) {
    return "Use at least 2 characters.";
  }
  return undefined;
}

const LOG_VERBS: Record<string, string> = {
  "handle.reserve": "reserved",
  "handle.update": "edited",
  "handle.assign": "assigned",
  "handle.unassign": "unassigned",
  "handle.release": "released",
  "handle.restore": "restored",
  "handle.exempt": "exempted",
  "handle.rename": "renamed an account away from",
  "handle.notice.start": "started a notice for",
  "handle.notice.resend": "sent the notice again for",
  "handle.notice.extend": "extended the notice for",
  "handle.notice.cancelled": "closed the notice for",
  "handle.expired": "ended the hold on",
  "handle.redirect.end": "ended the redirect from",
  "handle.redirect.restore": "restored the redirect from",
  "handle.redirect.expired": "ended the redirect from",
};

/** "@rob reserved acmewear, @maya" or "System ended the hold on dealhold" (board RA8) */
export function describeLog(row: {
  action: string;
  actorId: number | null;
  actorHandle: string | null;
  subject: string | null;
  targetUserId: number | null;
  targetHandle: string | null;
}): string {
  const actor =
    row.actorId === null
      ? "System"
      : row.actorHandle
        ? `@${row.actorHandle}`
        : `Admin ${row.actorId}`;
  const verb = LOG_VERBS[row.action] ?? row.action.replace(/^handle\./, "");
  const target =
    row.targetUserId === null
      ? ""
      : row.targetHandle
        ? `, @${row.targetHandle}`
        : `, account ${row.targetUserId}`;
  return `${actor} ${verb} ${row.subject ?? ""}${target}`.trim();
}

import crypto from "crypto";
import { env } from "../../env";

/**
 * Fan Graph (#22) rules with no database or auth dependency, shared by the
 * follow router and its unit tests. Spec: docs/features/fan-graph.md.
 */

/**
 * Fan Graph (#22): a handle for an account made from Follow. It comes from the
 * display name plus four random digits, never from the email, because the
 * creator sees the follower's @handle (docs/features/fan-graph.md, 3.2).
 */
export function fanHandleBase(name: string | null | undefined): string {
  const slug = (name ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : "fan";
}

// Counts under this number show as "New on Amped" (decision 9)
export const FOLLOWER_COUNT_FLOOR = 10;

export function publicCount(count: number, show: boolean) {
  if (!show) return { followerCount: null, showCount: false, newOnAmped: false };
  if (count < FOLLOWER_COUNT_FLOOR)
    return { followerCount: null, showCount: true, newOnAmped: true };
  return { followerCount: count, showCount: true, newOnAmped: false };
}

// ===== Restore token for Undo after Remove follower =====

export type RemovedFollow = {
  r: number; // follow_removal.id
  f: number; // follower_id
  c: number; // creator_id
  p: boolean; // show_publicly
  e: boolean; // email_updates
  ea: string | null; // email_updates_at
  s: string; // source
  k: string | null; // campaign_id hex
  t: string; // created_at
  x: number; // expires at (ms)
};

function sign(payload: string) {
  return crypto
    .createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`follow-restore:${payload}`)
    .digest("base64url");
}

export function encodeRestoreToken(row: RemovedFollow): string {
  const payload = Buffer.from(JSON.stringify(row)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeRestoreToken(token: string): RemovedFollow | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const row = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RemovedFollow;
    return row.x > Date.now() ? row : null;
  } catch {
    return null;
  }
}

export function csvCell(value: string | number | boolean) {
  const text = String(value);
  // Neutralize spreadsheet formulas and quote every cell
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

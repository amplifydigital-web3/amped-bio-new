import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import { isThemeConfigV2 } from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";

/**
 * Theme Engine v2 TE-4a (spec 3.9, decision 7): a creator's saved looks and
 * their history. A look is a `themes` row with kind "look" owned by the
 * creator; marketplace rows have no owner. Each look keeps its last 20 saves
 * in `theme_versions`.
 *
 * Autosave writes every 800 ms while a creator drags a slider, so a save
 * within VERSION_SESSION_MS of the newest version replaces it: one editing
 * session is one version, and the version before it is the look as the
 * session found it. Restore, apply and a new look always write a new version.
 */

export const LOOK_LIMIT = 10;
export const VERSION_LIMIT = 20;
export const VERSION_SESSION_MS = 10 * 60_000;
export const LOOK_NAME_MAX = 40;

/** The error message a client reads to show "10 of 10 looks". */
export const THEME_LIMIT = "THEME_LIMIT";

export function configVersion(config: unknown): 1 | 2 {
  return isThemeConfigV2(config) ? 2 : 1;
}

/** A look name: trimmed, single spaced, at most 40 characters. */
export function cleanLookName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, LOOK_NAME_MAX).trim();
}

/**
 * The name for a copy: "Sunset" becomes "Sunset 2", "Sunset 2" becomes
 * "Sunset 3", skipping names the creator already uses. Kept to 40 characters.
 */
export function copyName(name: string, taken: readonly string[]): string {
  const base = cleanLookName(name).replace(/ \d+$/, "") || "My look";
  const used = new Set(taken.map(n => n.toLowerCase()));
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`;
    const candidate = `${base.slice(0, LOOK_NAME_MAX - suffix.length).trim()}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

export async function countLooks(userId: number): Promise<number> {
  return prisma.theme.count({ where: { user_id: userId, kind: "look" } });
}

/** Refuses a new look at the limit. The message is THEME_LIMIT; the count is in the looks list. */
export async function assertLookRoom(userId: number): Promise<void> {
  if ((await countLooks(userId)) >= LOOK_LIMIT) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: THEME_LIMIT });
  }
}

/** The creator's own look, or NOT_FOUND. Another creator's look reads as missing. */
export async function ownLook(userId: number, id: number) {
  const look = await prisma.theme.findUnique({ where: { id } });
  if (!look || look.user_id !== userId || look.kind !== "look") {
    throw new TRPCError({ code: "NOT_FOUND", message: `Look not found: ${id}` });
  }
  return look;
}

/**
 * Records a save of a look. Within the session window the newest version takes
 * the new config and time; `force` always starts a new version. Then trims the
 * look to its last 20 versions. Returns the id of the version written.
 */
export async function recordVersion(
  themeId: number,
  config: unknown,
  { force = false, now = new Date() }: { force?: boolean; now?: Date } = {}
): Promise<string | null> {
  if (config === null || config === undefined) return null;
  const data = config as object;
  const newest = force
    ? null
    : await prisma.themeVersion.findFirst({
        where: { themeId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
  let written: string;
  if (newest && now.getTime() - newest.createdAt.getTime() < VERSION_SESSION_MS) {
    await prisma.themeVersion.update({
      where: { id: newest.id },
      data: { config: data, createdAt: now },
    });
    written = Buffer.from(newest.id).toString("hex");
  } else {
    written = Buffer.from(
      (
        await prisma.themeVersion.create({
          data: { id: uuidv7(), themeId, config: data, createdAt: now },
        })
      ).id
    ).toString("hex");
  }
  const stale = await prisma.themeVersion.findMany({
    where: { themeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: VERSION_LIMIT,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.themeVersion.deleteMany({ where: { id: { in: stale.map(v => v.id) } } });
  }
  return written;
}

/**
 * The theme a creator may apply: one of their own looks or a marketplace row.
 * 0 or less clears the applied theme (the page renders the default look).
 */
export async function applicableThemeId(userId: number, themeId: number): Promise<number | null> {
  if (!Number.isInteger(themeId) || themeId <= 0) return null;
  const theme = await prisma.theme.findUnique({
    where: { id: themeId },
    select: { id: true, user_id: true },
  });
  if (!theme || (theme.user_id !== null && theme.user_id !== userId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You can't apply this theme" });
  }
  return theme.id;
}

/**
 * The look an editor save without a look id writes to (applyTheme with
 * themeId 0): the applied look when it is the creator's own, else the look
 * edited last, else none (the caller creates the first one). Replaces the
 * old findFirst, which picked any row.
 */
export async function currentLookId(userId: number): Promise<number | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { theme: true } });
  if (user?.theme) {
    const applied = await prisma.theme.findUnique({
      where: { id: user.theme },
      select: { id: true, user_id: true, kind: true },
    });
    if (applied && applied.user_id === userId && applied.kind === "look") return applied.id;
  }
  const latest = await prisma.theme.findFirst({
    where: { user_id: userId, kind: "look" },
    orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return latest?.id ?? null;
}

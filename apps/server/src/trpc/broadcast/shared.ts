import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@repo/database";
import { BROADCAST_LIMITS, broadcastLinks, type BroadcastFlag } from "@repo/constants";
import { s3Service } from "../../services/S3Service";

export const creatorSelect = {
  id: true,
  name: true,
  handle: true,
  profileImage: { select: { s3_key: true } },
} as const;

export function avatarUrl(user: { profileImage: { s3_key: string } | null } | null) {
  return user?.profileImage ? s3Service.getFileUrl(user.profileImage.s3_key) : null;
}

/** The pool the caller owns on this chain, or FORBIDDEN. */
export async function ownedPool(userId: number, chainId: string) {
  const pool = await prisma.creatorPool.findFirst({
    where: { chainId, wallet: { userId } },
    select: { id: true, name: true, poolAddress: true },
  });
  if (!pool) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not own a pool on this network." });
  }
  return pool;
}

export const titleSchema = z
  .string()
  .trim()
  .min(1, "Add a title.")
  .max(BROADCAST_LIMITS.titleMax, `Titles are ${BROADCAST_LIMITS.titleMax} characters or fewer.`);

export const bodySchema = z
  .string()
  .trim()
  .min(1, "Write a message.")
  .max(BROADCAST_LIMITS.bodyMax, `Messages are ${BROADCAST_LIMITS.bodyMax} characters or fewer.`)
  .superRefine((body, ctx) => {
    const links = broadcastLinks(body);
    if (links.length > BROADCAST_LIMITS.linksMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Use ${BROADCAST_LIMITS.linksMax} links or fewer.`,
      });
    }
    for (const href of links) {
      try {
        const url = new URL(href);
        if (url.protocol !== "https:") throw new Error("not https");
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Links must start with https://" });
        return;
      }
    }
  });

/** Flags stored on the broadcast: phrase, category and field only. */
export function storedFlags(flags: BroadcastFlag[]) {
  const seen = new Set<string>();
  return flags
    .filter(f => {
      const key = `${f.field}:${f.phrase}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ phrase, category, field }) => ({ phrase, category, field }));
}

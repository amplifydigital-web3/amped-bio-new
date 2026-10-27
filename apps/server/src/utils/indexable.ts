import type { Prisma } from "@repo/database";

/**
 * Rules that decide whether a public profile may be indexed by search engines
 * and listed in the sitemap. The Prisma filter and the in-memory check must
 * stay equivalent, so both live here.
 *
 * A profile is indexable when it:
 * - has a handle
 * - has a published page (fan accounts from Follow have none, Fan Graph #22)
 * - is not suspended (block === "no")
 * - has a verified email
 * - has a non-empty description or at least one block
 */
export const indexableUserWhere: Prisma.UserWhereInput = {
  handle: { not: null },
  page_status: "PUBLISHED",
  block: "no",
  email_verified: true,
  OR: [
    { AND: [{ description: { not: null } }, { description: { not: "" } }] },
    { blocks: { some: {} } },
  ],
};

export function isUserIndexable(
  user: {
    handle: string | null;
    page_status: "PUBLISHED" | "UNPUBLISHED";
    block: string;
    email_verified: boolean;
    description: string | null;
  },
  blockCount: number
): boolean {
  if (!user.handle) return false;
  if (user.page_status !== "PUBLISHED") return false;
  if (user.block !== "no") return false;
  if (!user.email_verified) return false;
  const hasDescription = user.description !== null && user.description !== "";
  return hasDescription || blockCount > 0;
}

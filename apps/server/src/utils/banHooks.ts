import { prisma } from "@repo/database";

/**
 * Better Auth admin plugin: ban-user deletes the person's sessions only. OAuth
 * refresh tokens (MCP and third party apps) live in their own tables and the
 * refresh grant never reads `banned`, so a banned account would keep API access
 * for up to 30 days. Runs after every user update; acts only when the update
 * leaves the account banned.
 */
export async function revokeOAuthOnBan(user: { id?: string | number; banned?: boolean | null }) {
  if (user?.banned !== true || user.id === undefined) return;
  const userId = typeof user.id === "number" ? user.id : parseInt(user.id, 10);
  if (!Number.isInteger(userId)) return;
  await prisma.$transaction([
    prisma.oauthRefreshToken.deleteMany({ where: { userId } }),
    prisma.oauthAccessToken.deleteMany({ where: { userId } }),
  ]);
}

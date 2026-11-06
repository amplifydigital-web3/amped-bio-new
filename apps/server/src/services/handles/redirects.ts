import { prisma } from "@repo/database";

/**
 * Reserved handles (Build Board D2, spec 7.7). An old handle answers 307 to
 * the account's current handle while its redirect lives. The row stores the
 * account, not the new handle, so it follows later renames: no chains, no
 * loops. Null when the redirect ended, points back at itself, or the page is
 * not published.
 */
export async function resolveHandleRedirect(oldHandle: string): Promise<{ to: string } | null> {
  const row = await prisma.handleRedirect.findUnique({
    where: { oldHandle },
    select: {
      id: true,
      endsAt: true,
      user: { select: { handle: true, page_status: true } },
    },
  });
  if (!row || row.endsAt.getTime() <= Date.now()) return null;
  const to = row.user.handle?.toLowerCase();
  if (!to || to === oldHandle || row.user.page_status !== "PUBLISHED") return null;
  await prisma.handleRedirect
    .update({ where: { id: row.id }, data: { hits: { increment: 1 } } })
    .catch(() => undefined);
  return { to };
}

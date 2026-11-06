/**
 * Under 18 review cases (identity checks spec 4.5, decision IQ1). The privacy
 * notice says accounts are for people 18 and over and that Amped deletes an
 * account it learns belongs to someone under 18. An under 18 Authbase result is
 * that knowledge, so it always reaches a person: one open case per account, and
 * an alert email to support until the Safety queue (#28 R2) shows the case.
 *
 * Deciding a case (Clear, or Confirm and close account by a safety lead) ships
 * with the Safety queue. Nothing here closes an account.
 */
import { prisma } from "@repo/database";
import { env } from "../../env";
import { deliverEmail } from "../../utils/email/transport";
import { uuidv7 } from "../../utils/uuid-v7";

export async function hasOpenUnder18Case(userId: number): Promise<boolean> {
  const open = await prisma.identityReviewCase.findFirst({
    where: { userId, kind: "under_18", status: "open" },
    select: { id: true },
  });
  return open !== null;
}

/** Plain alert copy. Names no attribute value, birth date or ID. Exported for tests. */
export function under18AlertEmail(input: { caseId: string; handle: string | null; at: Date }) {
  const handle = input.handle ? `@${input.handle}` : "an account without a handle";
  const when = input.at.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const subject = `Under 18 review case ${input.caseId.slice(0, 8)}`;
  const text = [
    `An Authbase Over 18 check returned under 18 for ${handle} at ${when}.`,
    `Case ${input.caseId} is open. 18+ items stay closed to this account while it is open.`,
    "A safety lead reviews it under the privacy policy, section 12: confirm and close the account, or clear a wrong read.",
  ];
  const html = text.map(line => `<p>${line.replace(/</g, "&lt;")}</p>`).join("");
  return { subject, text, html };
}

async function sendAlert(caseId: Buffer, userId: number, at: Date) {
  if (!env.SAFETY_ALERT_EMAIL) {
    console.warn("[identity] SAFETY_ALERT_EMAIL is not set; under 18 case not emailed", {
      caseId: caseId.toString("hex"),
    });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true } });
  const email = under18AlertEmail({
    caseId: caseId.toString("hex"),
    handle: user?.handle ?? null,
    at,
  });
  await deliverEmail({ to: [env.SAFETY_ALERT_EMAIL], subject: email.subject, html: email.html });
  await prisma.identityReviewCase.update({
    where: { id: caseId },
    data: { alertedAt: new Date() },
  });
}

/**
 * Opens the account's case on the first under 18 result, or attaches a later
 * result to the open case. Sends the support alert once per case. Never throws:
 * the check result stands even if the email fails, and the next result retries
 * an alert that was never sent.
 */
export async function recordUnder18Result(userId: number, at: Date = new Date()): Promise<void> {
  try {
    const open = await prisma.identityReviewCase.findFirst({
      where: { userId, kind: "under_18", status: "open" },
      select: { id: true, alertedAt: true },
    });
    let caseId: Buffer;
    let alerted: boolean;
    if (open) {
      await prisma.identityReviewCase.update({
        where: { id: open.id },
        data: { lastResultAt: at, results: { increment: 1 } },
      });
      caseId = Buffer.from(open.id);
      alerted = open.alertedAt !== null;
    } else {
      caseId = uuidv7();
      await prisma.identityReviewCase.create({
        data: {
          id: caseId,
          userId,
          kind: "under_18",
          status: "open",
          openedAt: at,
          lastResultAt: at,
        },
      });
      alerted = false;
    }
    if (!alerted) await sendAlert(caseId, userId, at);
  } catch (err) {
    console.error("[identity] under 18 case or alert failed", {
      userId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

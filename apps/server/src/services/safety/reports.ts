/**
 * Reports into Safety (adult content review 7.1, PR R3). Every report joins or opens a
 * case. "This shows a child" (`csam`) hides the item at once and opens a Critical case,
 * behind the abuse guard: a reporter whose child reports were found unfounded 3 times
 * in 30 days loses the automatic hide, and their reports still open Critical cases.
 * Every other reason hides nothing.
 */
import { prisma, type ContentItem } from "@repo/database";
import {
  CHILD_REPORT_UNFOUNDED_DAYS,
  CHILD_REPORT_UNFOUNDED_LIMIT,
  type ContentReportReason,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { hideItems } from "../content/edge";
import { openCase } from "./cases";
import { sendChildSafetyAlert } from "./alert";
import { withdrawRelease } from "./adultSetup";

/** Child reports by this account that a reviewer cleared, in the window. */
export async function unfoundedChildReports(
  userId: number,
  now: Date = new Date()
): Promise<number> {
  const since = new Date(now.getTime() - CHILD_REPORT_UNFOUNDED_DAYS * 86_400_000);
  const reports = await prisma.contentReport.findMany({
    where: {
      reporterUserId: userId,
      reason: "csam",
      createdAt: { gte: since },
      caseId: { not: null },
    },
    select: { caseId: true },
  });
  if (!reports.length) return 0;
  return prisma.safetyCase.count({
    where: {
      id: { in: reports.map(report => Buffer.from(report.caseId!)) },
      outcome: { in: ["clear", "label_clear", "not_valid"] },
    },
  });
}

export async function intakeReport(
  item: Pick<ContentItem, "id" | "publicId" | "userId">,
  report: { reason: ContentReportReason; details: string | null; reporterUserId: number | null },
  now: Date = new Date()
): Promise<{ hidden: boolean; withdrawn?: boolean }> {
  let hidden = false;
  // "I appear in this and withdraw consent" from a person on the creator's list (7.1, R4)
  if (report.reason === "withdraw" && report.reporterUserId !== null) {
    const release = await prisma.appearingPerson.findFirst({
      where: { creatorUserId: item.userId, personUserId: report.reporterUserId, withdrawnAt: null },
      select: { id: true },
    });
    if (release) {
      const result = await withdrawRelease(
        report.reporterUserId,
        Buffer.from(release.id).toString("hex"),
        now
      );
      await prisma.contentReport.create({
        data: {
          id: uuidv7(),
          contentItemId: item.id,
          reporterUserId: report.reporterUserId,
          reason: report.reason,
          details: report.details,
        },
      });
      return { hidden: result.hidden > 0, withdrawn: true };
    }
  }
  let caseId: Buffer | null = null;
  try {
    if (report.reason === "csam") {
      const guarded =
        report.reporterUserId !== null &&
        (await unfoundedChildReports(report.reporterUserId, now)) >= CHILD_REPORT_UNFOUNDED_LIMIT;
      if (!guarded) {
        // Child safety: the gateway refuses even a Safety reveal token (8.5)
        await hideItems([item.publicId], "child_safety");
        hidden = true;
      }
      const opened = await openCase({
        type: "CHILD_SAFETY",
        contentItemId: item.id,
        creatorUserId: item.userId,
        actorId: report.reporterUserId,
        source: guarded ? "child_report_guarded" : "child_report",
      });
      caseId = Buffer.from(opened.case.id);
      if (!opened.joined) await sendChildSafetyAlert(opened.case.id);
    } else if (report.reason !== "ncii" && report.reason !== "withdraw") {
      const opened = await openCase({
        type: report.reason === "store_policy" ? "STORE_POLICY" : "REPORT",
        contentItemId: item.id,
        creatorUserId: item.userId,
        actorId: report.reporterUserId,
        source: `report:${report.reason}`,
      });
      caseId = Buffer.from(opened.case.id);
    }
  } catch (error) {
    console.error("[safety] ALERT report intake failed", {
      publicId: item.publicId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await prisma.contentReport.create({
    data: {
      id: uuidv7(),
      contentItemId: item.id,
      reporterUserId: report.reporterUserId,
      reason: report.reason,
      details: report.details,
      caseId,
    },
  });
  return { hidden };
}

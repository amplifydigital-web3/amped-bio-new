/**
 * Creators, appeals and the log (adult content review 5.4, 8.4 and 8.6, PR R5).
 *
 * - Creator profile: checks, 18+ status, people, strikes in 12 months, cases.
 * - Turn off 18+ (Amped): every 18+ item becomes a draft; the creator sees the reason.
 * - Suspend needs a second safety lead to approve. Two cases suspend at once and ask
 *   for approval after (COUNSEL-ADULT 4.7, decision D6): an open child safety case, and
 *   a confirmed upload of a person without consent (removed `non_consent` or Take It Down).
 * - Appeals: one per decision, within 30 days, up to 1,000 characters, decided by a
 *   safety lead who did not make the first decision. Child safety removals are final.
 *   A Take It Down Reverse emails the requester first; the restore waits 2 business days.
 * - Log: moderators read their own actions, safety leads everything, CSV export for counsel.
 */
import { prisma, type SafetyCase } from "@repo/database";
import { SAFETY_REASON_CODES, type SafetyReasonCode } from "@repo/constants";
import { deliverEmail } from "../../utils/email/transport";
import { checkIdentity } from "../identity/checks";
import { hideCreator, restoreItems } from "../content/edge";
import { logSafetyEvent } from "./events";
import { openCase } from "./cases";
import { releaseStatus } from "./adultSetup";
import { safetyBox } from "./crypto";
import { addBusinessDays } from "./time";
import { SafetyActionError, type Reviewer } from "./review";

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");
export const APPEAL_DAYS = 30;
export const APPEAL_MAX = 1000;
export const TAKEDOWN_RESTORE_NOTICE_DAYS = 2;

async function creatorByHandle(handle: string) {
  const user = await prisma.user.findFirst({
    where: { handle: handle.replace(/^@/, "").toLowerCase() },
    select: { id: true, handle: true, name: true, email: true, created_at: true, block: true },
  });
  if (!user) throw new SafetyActionError("not_found", "No creator with that handle.");
  return user;
}

async function notify(email: string | null, subject: string, lines: string[]) {
  if (!email) return;
  try {
    await deliverEmail({
      to: [email],
      subject,
      html: lines.map(l => `<p>${l.replace(/</g, "&lt;")}</p>`).join(""),
    });
  } catch (error) {
    console.error("[safety] notice failed", error instanceof Error ? error.message : error);
  }
}

// ----------------------------------------------------------------------------
// Creator profile (8.4, board ad4)
// ----------------------------------------------------------------------------

export async function creatorProfile(handle: string, now: Date = new Date()) {
  const user = await creatorByHandle(handle);
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
  const [profile, age, seller, people, strikes, cases, suspendEvents] = await Promise.all([
    prisma.creatorAdultProfile.findUnique({ where: { userId: user.id } }),
    checkIdentity(user.id, "age_over_18"),
    checkIdentity(user.id, "seller"),
    prisma.appearingPerson.findMany({ where: { creatorUserId: user.id } }),
    prisma.strike.findMany({ where: { userId: user.id, createdAt: { gte: yearAgo } } }),
    prisma.safetyCase.findMany({
      where: { creatorUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.safetyEvent.findMany({
      where: { action: "suspend_request", detail: { path: "$.userId", equals: user.id } },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
  ]);
  return {
    handle: user.handle,
    name: user.name,
    joined: user.created_at,
    suspended: user.block !== "no",
    suspendPending:
      suspendEvents.length > 0 && user.block === "no" ? suspendEvents[0]!.createdAt : null,
    checks: {
      over18: age.pass
        ? { pass: true as const, validUntil: age.validUntil }
        : { pass: false as const, reason: age.reason },
      seller: seller.pass
        ? { pass: true as const, validUntil: seller.validUntil }
        : { pass: false as const, reason: seller.reason },
    },
    adult: {
      on: Boolean(profile?.enabledAt && !profile.disabledAt),
      policyVersion: profile?.policyVersion ?? null,
      custodianNamed: Boolean(profile?.custodianName),
      offByAmped: Boolean(profile?.disabledAt && profile.disabledBy !== null),
      offReason: profile?.disabledReason ?? null,
    },
    people: people.map(person => ({
      displayName: person.displayName,
      status: releaseStatus(person),
    })),
    strikes: strikes.map(strike => ({
      reasonCode: strike.reasonCode,
      createdAt: strike.createdAt,
      reversed: strike.reversedAt !== null,
    })),
    cases: cases.map(row => ({
      id: hex(row.id),
      number: row.number,
      type: row.type,
      state: row.state,
      outcome: row.outcome,
      createdAt: row.createdAt,
    })),
  };
}

export async function disableAdultByAmped(handle: string, reason: string, reviewer: Reviewer) {
  const user = await creatorByHandle(handle);
  const now = new Date();
  await prisma.creatorAdultProfile.updateMany({
    where: { userId: user.id },
    data: { disabledAt: now, disabledBy: reviewer.id, disabledReason: reason.slice(0, 255) },
  });
  const result = await prisma.contentItem.updateMany({
    where: { userId: user.id, adult: true, publishState: "PUBLISHED" },
    data: { publishState: "DRAFT" },
  });
  await logSafetyEvent({
    actorId: reviewer.id,
    action: "adult_off",
    detail: { userId: user.id, unpublished: result.count },
    note: reason,
  });
  await notify(user.email, "18+ turned off by Amped.Bio", [
    `18+ was turned off on your account. Reason: ${reason}`,
    "Your 18+ items are drafts again. You can appeal from Adult content.",
  ]);
  return { unpublished: result.count };
}

/** True when the creator's case history allows an immediate suspend (D6). */
async function immediateAllowed(userId: number): Promise<boolean> {
  const child = await prisma.safetyCase.count({
    where: {
      creatorUserId: userId,
      type: "CHILD_SAFETY",
      state: { in: ["OPEN", "CLAIMED", "WAITING_CREATOR"] },
    },
  });
  if (child) return true;
  const consent = await prisma.safetyCase.count({
    where: {
      creatorUserId: userId,
      OR: [
        { outcome: "removed", reasonCode: "non_consent" },
        { type: "TAKE_IT_DOWN", outcome: "removed" },
      ],
    },
  });
  return consent > 0;
}

async function suspend(userId: number) {
  await prisma.user.update({ where: { id: userId }, data: { block: "yes" } });
  // Every item of the creator goes BLOCKED at the edge (C7a)
  await hideCreator(userId);
}

export async function requestSuspend(
  input: { handle: string; reason: string; immediate?: boolean },
  reviewer: Reviewer
) {
  const user = await creatorByHandle(input.handle);
  if (input.immediate && !(await immediateAllowed(user.id))) {
    throw new SafetyActionError(
      "bad_request",
      "Suspend at once only for a child safety escalation or a confirmed upload without consent."
    );
  }
  if (input.immediate) await suspend(user.id);
  await logSafetyEvent({
    actorId: reviewer.id,
    action: "suspend_request",
    detail: { userId: user.id, immediate: Boolean(input.immediate) },
    note: input.reason,
  });
  return { suspended: Boolean(input.immediate), waitingForApproval: true };
}

export async function approveSuspend(handle: string, reviewer: Reviewer) {
  if (!reviewer.lead) throw new SafetyActionError("forbidden", "Only a safety lead can approve.");
  const user = await creatorByHandle(handle);
  const request = await prisma.safetyEvent.findFirst({
    where: { action: "suspend_request", detail: { path: "$.userId", equals: user.id } },
    orderBy: { createdAt: "desc" },
  });
  if (!request) throw new SafetyActionError("bad_request", "No suspend request to approve.");
  if (request.actorId === reviewer.id) {
    throw new SafetyActionError("forbidden", "A second safety lead approves a suspend.");
  }
  if (user.block === "no") await suspend(user.id);
  await logSafetyEvent({
    actorId: reviewer.id,
    action: "suspend_approve",
    detail: { userId: user.id },
  });
  await notify(user.email, "Your account is suspended", [
    "Your Amped.Bio account is suspended after a safety review. Reply to this email to ask about it.",
  ]);
}

// ----------------------------------------------------------------------------
// Appeals (5.4, 8.6)
// ----------------------------------------------------------------------------

export async function fileAppeal(
  userId: number,
  input: { publicId: string; text: string },
  now: Date = new Date()
) {
  const item = await prisma.contentItem.findUnique({
    where: { publicId: input.publicId },
    select: { id: true, userId: true },
  });
  if (!item || item.userId !== userId)
    throw new SafetyActionError("not_found", "This item is not available.");
  const decided = await prisma.safetyCase.findFirst({
    where: { contentItemId: item.id, state: "DECIDED", type: { not: "APPEAL" } },
    orderBy: { decidedAt: "desc" },
  });
  if (!decided || !decided.decidedAt)
    throw new SafetyActionError("bad_request", "There is no decision to appeal.");
  if (decided.type === "CHILD_SAFETY" || decided.outcome === "escalated") {
    throw new SafetyActionError("forbidden", "appeal_not_allowed: this decision is final.");
  }
  if (now.getTime() - decided.decidedAt.getTime() > APPEAL_DAYS * 86_400_000) {
    throw new SafetyActionError("bad_request", "Appeals close 30 days after the decision.");
  }
  const earlier = await prisma.safetyCase.count({
    where: { type: "APPEAL", parentCaseId: decided.id },
  });
  if (earlier) throw new SafetyActionError("conflict", "This decision was already appealed.");
  const opened = await openCase({
    type: "APPEAL",
    contentItemId: item.id,
    creatorUserId: userId,
    parentCaseId: decided.id,
    actorId: userId,
    source: "appeal",
    note: input.text.slice(0, APPEAL_MAX),
  });
  return { number: opened.case.number };
}

/** Uphold or Reverse. The appeal reviewer must differ from the first one. */
export async function decideAppeal(
  input: { caseId: string; outcome: "upheld" | "reversed"; note: string },
  reviewer: Reviewer,
  now: Date = new Date()
) {
  if (!reviewer.lead)
    throw new SafetyActionError("forbidden", "Only a safety lead decides appeals.");
  const appeal = await prisma.safetyCase.findUnique({
    where: { id: Buffer.from(input.caseId, "hex") },
  });
  if (!appeal || appeal.type !== "APPEAL" || !appeal.parentCaseId) {
    throw new SafetyActionError("not_found", "Appeal not found.");
  }
  if (appeal.state === "DECIDED" || appeal.state === "CLOSED") {
    throw new SafetyActionError("conflict", "This appeal is decided.");
  }
  const parent = await prisma.safetyCase.findUnique({
    where: { id: Buffer.from(appeal.parentCaseId) },
  });
  if (!parent) throw new SafetyActionError("not_found", "The first decision is missing.");
  if (parent.decidedById === reviewer.id) {
    throw new SafetyActionError("forbidden", "A different reviewer decides the appeal.");
  }
  if (input.note.trim().length < 10)
    throw new SafetyActionError("bad_request", "Add a note of at least 10 characters.");

  let restoreAfter: Date | null = null;
  if (input.outcome === "reversed") {
    await prisma.strike.updateMany({
      where: { caseId: parent.id, reversedAt: null },
      data: { reversedAt: now },
    });
    if (parent.type === "TAKE_IT_DOWN") {
      // AD-D2: the requester hears first; the restore waits 2 business days
      restoreAfter = addBusinessDays(now, TAKEDOWN_RESTORE_NOTICE_DAYS);
      await noticeRequester(parent, input.note);
      await logSafetyEvent({
        caseId: appeal.id,
        actorId: reviewer.id,
        action: "requester_notified",
        detail: { restoreAfter: restoreAfter.toISOString() },
      });
    } else {
      await restoreParentItem(parent);
    }
  }
  await prisma.safetyCase.update({
    where: { id: appeal.id },
    data: {
      state: restoreAfter ? "WAITING_CREATOR" : "DECIDED",
      outcome: input.outcome,
      decidedById: reviewer.id,
      decidedAt: now,
      ...(restoreAfter ? { dueAt: restoreAfter } : {}),
    },
  });
  await logSafetyEvent({
    caseId: appeal.id,
    actorId: reviewer.id,
    action: "decide",
    detail: { outcome: input.outcome },
    note: input.note.trim(),
  });
  return { outcome: input.outcome, restoreAfter };
}

async function restoreParentItem(parent: SafetyCase) {
  if (!parent.contentItemId) return;
  const item = await prisma.contentItem.findUnique({
    where: { id: Buffer.from(parent.contentItemId) },
    select: { id: true, publicId: true },
  });
  if (!item) return;
  await prisma.contentItem.update({
    where: { id: item.id },
    data: { moderationState: "CLEAR", moderationReason: null },
  });
  await restoreItems([item.publicId]);
}

async function noticeRequester(parent: SafetyCase, reason: string) {
  if (!parent.requestId) return;
  const request = await prisma.takedownRequest.findUnique({
    where: { id: Buffer.from(parent.requestId) },
  });
  const email = request ? safetyBox.decrypt(request.contactEmail) : null;
  await notify(email, `Take It Down request ${request?.number ?? ""}: appeal`, [
    `After an appeal, a safety lead found the items in request ${request?.number ?? ""} should come back. Reason: ${reason}`,
    "They come back in 2 business days unless you reply to this email.",
  ]);
}

/** The Take It Down restore after the notice window (8.6). Refused without `requester_notified`. */
export async function restoreAfterNotice(
  caseId: string,
  reviewer: Reviewer,
  now: Date = new Date()
) {
  if (!reviewer.lead) throw new SafetyActionError("forbidden", "Only a safety lead can restore.");
  const appeal = await prisma.safetyCase.findUnique({ where: { id: Buffer.from(caseId, "hex") } });
  if (!appeal?.parentCaseId || appeal.outcome !== "reversed")
    throw new SafetyActionError("bad_request", "Nothing to restore.");
  const notified = await prisma.safetyEvent.findFirst({
    where: { caseId: appeal.id, action: "requester_notified" },
  });
  if (!notified)
    throw new SafetyActionError(
      "forbidden",
      "The requester must be told before anything is restored."
    );
  if (now < appeal.dueAt)
    throw new SafetyActionError("bad_request", "The 2 business day notice has not passed.");
  const parent = await prisma.safetyCase.findUnique({
    where: { id: Buffer.from(appeal.parentCaseId) },
  });
  if (parent) await restoreParentItem(parent);
  await prisma.safetyCase.update({ where: { id: appeal.id }, data: { state: "DECIDED" } });
  await logSafetyEvent({ caseId: appeal.id, actorId: reviewer.id, action: "restore" });
}

// ----------------------------------------------------------------------------
// Log (8.6)
// ----------------------------------------------------------------------------

export async function listLog(
  filter: { actorId?: number; caseNumber?: string; action?: string; limit?: number },
  reviewer: Reviewer
) {
  let caseId: Buffer | undefined;
  if (filter.caseNumber) {
    const found = await prisma.safetyCase.findUnique({
      where: { number: filter.caseNumber },
      select: { id: true },
    });
    caseId = found ? Buffer.from(found.id) : Buffer.alloc(16);
  }
  const rows = await prisma.safetyEvent.findMany({
    where: {
      // Moderators read their own actions only
      ...(reviewer.lead
        ? filter.actorId
          ? { actorId: filter.actorId }
          : {}
        : { actorId: reviewer.id }),
      ...(caseId ? { caseId } : {}),
      ...(filter.action ? { action: filter.action } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.limit ?? 200, 1000),
  });
  const caseIds = [...new Set(rows.flatMap(r => (r.caseId ? [hex(r.caseId)] : [])))];
  const cases = caseIds.length
    ? await prisma.safetyCase.findMany({
        where: { id: { in: caseIds.map(id => Buffer.from(id, "hex")) } },
        select: { id: true, number: true },
      })
    : [];
  const numberOf = new Map<string, string>(cases.map(c => [hex(c.id), c.number] as const));
  return rows.map(row => ({
    at: row.createdAt,
    actorId: row.actorId,
    caseNumber: row.caseId ? (numberOf.get(hex(row.caseId)) ?? null) : null,
    action: row.action,
    detail: row.detail === null ? null : JSON.stringify(row.detail),
    note: row.note,
  }));
}

export async function exportLog(filter: Parameters<typeof listLog>[0], reviewer: Reviewer) {
  if (!reviewer.lead)
    throw new SafetyActionError("forbidden", "Only a safety lead can export the log.");
  const rows = await listLog({ ...filter, limit: 1000 }, reviewer);
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["at", "actor", "case", "action", "detail", "note"].join(","),
    ...rows.map(r =>
      [r.at.toISOString(), r.actorId, r.caseNumber, r.action, r.detail, r.note].map(cell).join(",")
    ),
  ];
  await logSafetyEvent({ actorId: reviewer.id, action: "export", detail: { rows: rows.length } });
  return lines.join("\n");
}

/** The creator facing reason text for a decision (5.4). */
export function creatorReason(code: string | null): string | null {
  return code && code in SAFETY_REASON_CODES
    ? SAFETY_REASON_CODES[code as SafetyReasonCode].creator
    : null;
}

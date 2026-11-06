/**
 * The Requests desk (adult content review 8.3, boards ad3 and ad3b, PR R3): Take It
 * Down and copyright requests with their clocks. Contact details are masked until a
 * safety lead shows them, which is logged. A Take It Down request can not close while
 * a located item is visible; the creator is never told who asked.
 */
import { prisma, type TakedownRequest } from "@repo/database";
import { env } from "../../env";
import { deliverEmail } from "../../utils/email/transport";
import { hideItems, restoreItems } from "../content/edge";
import { safetyBox } from "./crypto";
import { logSafetyEvent } from "./events";
import { blockHash, findByPhash } from "./blocklist";
import { getSafetySettings } from "./settings";
import { SafetyActionError, type Reviewer } from "./review";

const OPEN_STATES = ["OPEN", "CLAIMED", "WAITING_CREATOR"] as const;

function maskEmail(value: string | null): string | null {
  if (!value) return null;
  const [user, domain] = value.split("@");
  return user && domain ? `${user.slice(0, 1)}***@${domain}` : "***";
}

async function mail(to: string | null, subject: string, lines: string[]) {
  if (!to || to.startsWith("user:")) return;
  try {
    await deliverEmail({
      to: [to],
      subject,
      html: lines.map(line => `<p>${line.replace(/</g, "&lt;")}</p>`).join(""),
    });
  } catch (error) {
    console.error("[safety] request email failed", error instanceof Error ? error.message : error);
  }
}

async function mailUser(userId: number, subject: string, lines: string[]) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  await mail(user?.email ?? null, subject, lines);
}

const idsOf = (request: Pick<TakedownRequest, "locations">) =>
  (request.locations as Array<{ publicId: string | null }>).flatMap(l =>
    l.publicId ? [l.publicId] : []
  );

async function load(number: string) {
  const request = await prisma.takedownRequest.findUnique({ where: { number } });
  if (!request) throw new SafetyActionError("not_found", "Request not found.");
  const safetyCase = await prisma.safetyCase.findFirst({ where: { requestId: request.id } });
  return { request, safetyCase };
}

export async function listRequests(filter: {
  kind?: "ncii" | "copyright" | "counter";
  open?: boolean;
}) {
  const rows = await prisma.takedownRequest.findMany({
    where: {
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.open === false ? {} : { closedAt: null }),
    },
    orderBy: [{ dueAt: "asc" }],
    take: 100,
  });
  const now = Date.now();
  return rows.map(row => ({
    number: row.number,
    kind: row.kind,
    receivedAt: row.receivedAt,
    dueAt: row.dueAt,
    hoursLeft: Math.round((row.dueAt.getTime() - now) / 3_600_000),
    items: idsOf(row).length,
    closedAt: row.closedAt,
    outcome: row.outcome,
    restoreFrom: row.restoreFrom,
    restoreBy: row.restoreBy,
  }));
}

export async function getRequest(number: string) {
  const { request, safetyCase } = await load(number);
  const ids = idsOf(request);
  const items = ids.length
    ? await prisma.contentItem.findMany({
        where: { publicId: { in: ids } },
        select: {
          id: true,
          publicId: true,
          sha256: true,
          hiddenAt: true,
          edgeState: true,
          userId: true,
        },
      })
    : [];
  const hashes = items.flatMap(item => (item.sha256 ? [item.sha256] : []));
  const copies = hashes.length
    ? await prisma.contentItem.findMany({
        where: { sha256: { in: hashes }, publicId: { notIn: ids } },
        select: { publicId: true, hiddenAt: true, edgeState: true },
      })
    : [];
  const events = safetyCase
    ? await prisma.safetyEvent.findMany({
        where: { caseId: safetyCase.id },
        orderBy: { createdAt: "asc" },
      })
    : [];
  return {
    number: request.number,
    kind: request.kind,
    receivedAt: request.receivedAt,
    dueAt: request.dueAt,
    closedAt: request.closedAt,
    outcome: request.outcome,
    relationship: request.relationship,
    statement: request.statement,
    work: request.workDescription,
    email: maskEmail(safetyBox.decrypt(request.contactEmail)),
    hasPhone: Boolean(request.contactPhone),
    restoreFrom: request.restoreFrom,
    restoreBy: request.restoreBy,
    suitFiledAt: request.suitFiledAt,
    caseNumber: safetyCase?.number ?? null,
    flagged: events.some(event => event.action === "abuse_flag"),
    items: items.map(item => ({
      publicId: item.publicId,
      hidden: item.hiddenAt !== null,
      edge: item.edgeState,
    })),
    copies: copies.map(copy => ({
      publicId: copy.publicId,
      hidden: copy.hiddenAt !== null,
      edge: copy.edgeState,
    })),
  };
}

/** Near copies by perceptual hash, for the reviewer to hide (7.3). */
export async function nearCopies(phash: string) {
  const settings = await getSafetySettings();
  const rows = await findByPhash(phash, settings.phashThreshold);
  return rows.map(row => ({ sha256: row.sha256.slice(0, 12), reason: row.reason }));
}

/** Show contact (safety lead, logged). */
export async function revealContact(number: string, reviewer: Reviewer) {
  if (!reviewer.lead)
    throw new SafetyActionError("forbidden", "Only a safety lead can show contact details.");
  const { request, safetyCase } = await load(number);
  await logSafetyEvent({
    caseId: safetyCase?.id ?? null,
    actorId: reviewer.id,
    action: "contact_reveal",
    detail: { request: number },
  });
  return {
    email: safetyBox.decrypt(request.contactEmail),
    phone: safetyBox.decrypt(request.contactPhone),
    name:
      request.kind === "ncii"
        ? safetyBox.decrypt(request.signature)
        : safetyBox.decrypt(request.agentDetail),
    postalAddress: safetyBox.decrypt(request.postalAddress),
  };
}

/**
 * Claims the request transition. Two reviewers (or a double click) can have the same
 * request open, and a second close must not send a second email, block again, or
 * close another reviewer's decision.
 */
async function claim(request: TakedownRequest, now: Date, outcome: string): Promise<void> {
  const claimed = await prisma.takedownRequest.updateMany({
    where: { id: request.id, closedAt: null },
    data: { closedAt: now, outcome },
  });
  if (claimed.count !== 1) throw new SafetyActionError("conflict", "This request is closed.");
}

async function finish(
  request: TakedownRequest,
  safetyCaseId: Uint8Array | null,
  outcome: string,
  reviewer: Reviewer,
  note: string,
  now: Date
) {
  if (safetyCaseId) {
    await prisma.safetyCase.update({
      where: { id: Buffer.from(safetyCaseId) },
      data: { state: "DECIDED", outcome, decidedById: reviewer.id, decidedAt: now },
    });
  }
  await logSafetyEvent({
    caseId: safetyCaseId,
    actorId: reviewer.id,
    action: "decide",
    detail: { request: request.number, outcome },
    note,
  });
}

/** Take It Down: Remove (hash blocked, copies hidden, requester told) or Not valid (restore). */
export async function decideTakedown(
  input: { number: string; outcome: "removed" | "not_valid"; note: string; reason?: string },
  reviewer: Reviewer,
  now: Date = new Date()
) {
  const { request, safetyCase } = await load(input.number);
  if (request.kind !== "ncii")
    throw new SafetyActionError("bad_request", "Not a Take It Down request.");
  if (request.closedAt) throw new SafetyActionError("conflict", "This request is closed.");
  if (input.note.trim().length < 10)
    throw new SafetyActionError("bad_request", "Add a note of at least 10 characters.");
  await claim(request, now, input.outcome);
  const ids = idsOf(request);
  const items = await prisma.contentItem.findMany({
    where: { publicId: { in: ids } },
    select: { publicId: true, sha256: true, userId: true, title: true },
  });
  // The exact copies hidden at submit belong to this request too: a Not valid
  // decision restores them, and a Remove tells their creators
  const hashes = items.flatMap(item => (item.sha256 ? [item.sha256] : []));
  const copies = hashes.length
    ? await prisma.contentItem.findMany({
        where: { sha256: { in: hashes } },
        select: { publicId: true, userId: true },
      })
    : [];
  const all = [...new Set([...ids, ...copies.map(copy => copy.publicId)])];
  const owners = [...new Set([...items, ...copies].map(row => row.userId))];
  const requester = safetyBox.decrypt(request.contactEmail);
  if (input.outcome === "removed") {
    await hideItems(all, "take_it_down");
    for (const sha256 of hashes) {
      await blockHash({
        sha256,
        reason: "ncii",
        caseId: safetyCase?.id ?? null,
        addedById: reviewer.id,
      });
    }
    await prisma.contentItem.updateMany({
      where: { publicId: { in: all } },
      data: { moderationState: "BLOCKED", moderationReason: "safety:take_it_down" },
    });
    for (const creator of owners) {
      await mailUser(creator, "An item was removed", [
        "An item of yours was removed under the Take It Down Act after a request from the person shown.",
        "You can appeal this decision from the item in your library.",
      ]);
    }
    await mail(requester, `Take It Down request ${request.number}: removed`, [
      `We removed the items in request ${request.number} and blocked the file from being uploaded again.`,
    ]);
  } else {
    await restoreItems(all);
    await mail(requester, `Take It Down request ${request.number}: not valid`, [
      `We could not act on request ${request.number}.`,
      input.reason ?? input.note,
    ]);
  }
  await finish(request, safetyCase?.id ?? null, input.outcome, reviewer, input.note.trim(), now);
}

/** Copyright: Disable (hidden, hash offered, creator told with the sender's name and email) or Not valid. */
export async function decideCopyright(
  input: { number: string; outcome: "removed" | "not_valid"; note: string; blockFile?: boolean },
  reviewer: Reviewer,
  now: Date = new Date()
) {
  const { request, safetyCase } = await load(input.number);
  if (request.kind !== "copyright")
    throw new SafetyActionError("bad_request", "Not a copyright notice.");
  if (request.closedAt) throw new SafetyActionError("conflict", "This notice is closed.");
  if (input.note.trim().length < 10)
    throw new SafetyActionError("bad_request", "Add a note of at least 10 characters.");
  await claim(request, now, input.outcome);
  const ids = idsOf(request);
  const sender = safetyBox.decrypt(request.contactEmail);
  if (input.outcome === "removed") {
    const items = await prisma.contentItem.findMany({
      where: { publicId: { in: ids } },
      select: { publicId: true, sha256: true, userId: true },
    });
    await hideItems(ids, "safety");
    if (input.blockFile ?? true) {
      for (const item of items) {
        if (item.sha256) {
          await blockHash({
            sha256: item.sha256,
            reason: "copyright",
            caseId: safetyCase?.id ?? null,
            addedById: reviewer.id,
          });
        }
      }
    }
    const senderName = safetyBox.decrypt(request.agentDetail);
    const counter = `${(env.LANDINGPAGE_URL || "https://amped.bio").replace(/\/$/, "")}/copyright/${request.number}/counter`;
    for (const creator of new Set(items.map(item => item.userId))) {
      await mailUser(creator, "An item was disabled after a copyright notice", [
        `Notice ${request.number} says an item of yours copies this work: ${request.workDescription ?? ""}`,
        `Sent by ${senderName ?? "the copyright owner"} (${sender ?? "no email"}).`,
        `If it was removed by mistake, you can send a counter notice: ${counter}`,
      ]);
    }
    await mail(sender, `Copyright notice ${request.number}: disabled`, [
      `We disabled the items in notice ${request.number}.`,
    ]);
  } else {
    await mail(sender, `Copyright notice ${request.number}: not valid`, [
      `We could not act on notice ${request.number}.`,
      input.note,
    ]);
  }
  await finish(request, safetyCase?.id ?? null, input.outcome, reviewer, input.note.trim(), now);
}

/** Claimant filed suit: the item stays hidden and the counter notice closes. */
export async function suitFiled(
  input: { number: string; reference: string },
  reviewer: Reviewer,
  now: Date = new Date()
) {
  const { request, safetyCase } = await load(input.number);
  if (request.kind !== "counter")
    throw new SafetyActionError("bad_request", "Not a counter notice.");
  await claim(request, now, "kept");
  await prisma.takedownRequest.update({
    where: { id: request.id },
    data: { suitFiledAt: now, suitReference: input.reference.slice(0, 120) },
  });
  await finish(
    request,
    safetyCase?.id ?? null,
    "kept",
    reviewer,
    `Suit filed: ${input.reference}`,
    now
  );
}

/** Restore after a counter notice, inside the 10 to 14 business day window (safety lead). */
export async function restoreAfterCounter(
  number: string,
  reviewer: Reviewer,
  now: Date = new Date()
) {
  if (!reviewer.lead) throw new SafetyActionError("forbidden", "Only a safety lead can restore.");
  const { request, safetyCase } = await load(number);
  if (request.kind !== "counter" || request.closedAt) {
    throw new SafetyActionError("bad_request", "Nothing to restore.");
  }
  if (request.restoreFrom && now < request.restoreFrom) {
    throw new SafetyActionError("bad_request", "The restore window has not opened yet.");
  }
  await claim(request, now, "reversed");
  const ids = idsOf(request);
  await restoreItems(ids);
  const original = request.counterOfId
    ? await prisma.takedownRequest.findUnique({ where: { id: Buffer.from(request.counterOfId) } })
    : null;
  await mail(
    original ? safetyBox.decrypt(original.contactEmail) : null,
    `Restored after a counter notice`,
    [`The items in notice ${original?.number ?? ""} were restored after a counter notice.`]
  );
  await finish(
    request,
    safetyCase?.id ?? null,
    "reversed",
    reviewer,
    "Restored after counter notice",
    now
  );
}

/** Open Take It Down cases past 36 hours, for the safety lead page and banner (7.3). */
export async function lateTakedowns(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - 36 * 3_600_000);
  return prisma.takedownRequest.count({
    where: { kind: "ncii", closedAt: null, receivedAt: { lt: cutoff } },
  });
}

export { OPEN_STATES as REQUEST_CASE_STATES };

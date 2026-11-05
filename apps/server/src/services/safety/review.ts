/**
 * The Safety queue and case view (Build Board #28, adult content review 8.1, 8.2 and
 * 8.5, PR R2). Every action writes a SafetyEvent. Child safety and Age result cases
 * never return a thumbnail, a media key or a reveal token.
 *
 * Decisions on an item:
 * - clear: moderation CLEAR; a Safety hide is lifted.
 * - label_clear: 18+ on and CLEAR. Only when the creator has 18+ turned on.
 * - needs_change: the case waits for the creator; the item stays held; the creator
 *   gets the reason.
 * - removed: hidden at the edge (C7a `hideItems`, reason `safety`) and moderation
 *   BLOCKED; optionally a strike (safety lead) and "Block this file everywhere".
 * Escalate to child safety hides the item for everyone with reason `child_safety`,
 * opens a Critical case, copies the evidence and sends the alert.
 */
import { prisma, type ContentItem, type SafetyCase } from "@repo/database";
import {
  SAFETY_NO_MEDIA_TYPES,
  SAFETY_REASON_CODES,
  SAFETY_REVEAL_SECONDS,
  type SafetyCaseType,
  type SafetyOutcome,
  type SafetyReasonCode,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { deliverEmail } from "../../utils/email/transport";
import { env } from "../../env";
import { edgeStatus, hideItems, restoreItems, syncEdge } from "../content/edge";
import { mediaUrl, signMediaToken } from "../cloudflare/mediaToken";
import { logSafetyEvent } from "./events";
import { openCase } from "./cases";
import { blockHash } from "./blocklist";
import { preserveEvidence } from "./evidence";
import { sendChildSafetyAlert } from "./alert";
import { getSafetySettings } from "./settings";

export class SafetyActionError extends Error {
  constructor(
    readonly code: "not_found" | "forbidden" | "bad_request" | "conflict",
    message: string
  ) {
    super(message);
    this.name = "SafetyActionError";
  }
}

export type Reviewer = { id: number; lead: boolean };

const OPEN = ["OPEN", "CLAIMED", "WAITING_CREATOR"] as const;
const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");
const bytes = (value: string) => Buffer.from(value, "hex");

function noMedia(type: SafetyCaseType): boolean {
  return SAFETY_NO_MEDIA_TYPES.includes(type);
}

async function loadCase(caseId: string): Promise<SafetyCase> {
  if (!/^[0-9a-f]{32}$/.test(caseId)) throw new SafetyActionError("not_found", "Case not found.");
  const found = await prisma.safetyCase.findUnique({ where: { id: bytes(caseId) } });
  if (!found) throw new SafetyActionError("not_found", "Case not found.");
  return found;
}

/** Child safety cases are the safety lead's (8.5, 8.8). */
function requireAccess(safetyCase: SafetyCase, reviewer: Reviewer) {
  if (safetyCase.type === "CHILD_SAFETY" && !reviewer.lead) {
    throw new SafetyActionError("forbidden", "Child safety cases are for a safety lead.");
  }
}

// ----------------------------------------------------------------------------
// Queue (8.1)
// ----------------------------------------------------------------------------

export type QueueFilter = {
  type?: SafetyCaseType;
  severity?: 0 | 1 | 2;
  mine?: boolean;
  unassigned?: boolean;
  overdue?: boolean;
  limit?: number;
  cursor?: string;
};

/** A claimed case with no activity for the idle window counts as released (8.1). */
export function claimLapsed(
  safetyCase: Pick<SafetyCase, "claimedAt">,
  idleMinutes: number,
  now: Date
) {
  return (
    !safetyCase.claimedAt || now.getTime() - safetyCase.claimedAt.getTime() > idleMinutes * 60_000
  );
}

export async function listQueue(filter: QueueFilter, reviewer: Reviewer, now: Date = new Date()) {
  const limit = Math.min(filter.limit ?? 50, 100);
  const rows = await prisma.safetyCase.findMany({
    where: {
      state: { in: [...OPEN] },
      // Moderators do not see child safety cases (8.8)
      ...(reviewer.lead
        ? filter.type
          ? { type: filter.type }
          : {}
        : filter.type === "CHILD_SAFETY"
          ? { id: Buffer.alloc(16) }
          : { type: filter.type ?? { not: "CHILD_SAFETY" as const } }),
      ...(filter.severity !== undefined ? { severity: filter.severity } : {}),
      ...(filter.mine ? { assigneeId: reviewer.id } : {}),
      ...(filter.unassigned ? { assigneeId: null } : {}),
      ...(filter.overdue ? { dueAt: { lt: now } } : {}),
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    ...(filter.cursor && /^[0-9a-f]{32}$/.test(filter.cursor)
      ? { cursor: { id: bytes(filter.cursor) }, skip: 1 }
      : {}),
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const settings = await getSafetySettings();
  const userIds = [
    ...new Set(
      page
        .flatMap(row => [row.creatorUserId, row.assigneeId])
        .filter((v): v is number => v !== null)
    ),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, handle: true, name: true },
      })
    : [];
  const byId = new Map<number, { handle: string | null; name: string }>(
    users.map(user => [user.id, user] as const)
  );
  const itemIds = page.flatMap(row =>
    row.contentItemId && !noMedia(row.type) ? [row.contentItemId] : []
  );
  const blurs = itemIds.length
    ? await prisma.contentAsset.findMany({
        where: { contentItemId: { in: itemIds.map(id => Buffer.from(id)) }, role: "BLUR" },
        select: { contentItemId: true, r2Key: true },
      })
    : [];
  const blurByItem = new Map<string, string | null>(
    blurs.map(row => [hex(row.contentItemId), row.r2Key] as const)
  );
  return {
    items: page.map(row => {
      const lapsed = claimLapsed(row, settings.claimIdleMinutes, now);
      const blurKey =
        row.contentItemId && !noMedia(row.type) ? blurByItem.get(hex(row.contentItemId)) : null;
      return {
        id: hex(row.id),
        number: row.number,
        type: row.type,
        severity: row.severity,
        state: row.state,
        createdAt: row.createdAt,
        dueAt: row.dueAt,
        overdue: row.dueAt < now,
        creator: row.creatorUserId ? (byId.get(row.creatorUserId)?.handle ?? null) : null,
        assignee: row.assigneeId && !lapsed ? (byId.get(row.assigneeId)?.name ?? "Someone") : null,
        // The blur only, behind a Safety token; never for child safety or Age result
        thumb: blurKey ? safetyAssetUrl(blurKey, "BLUR", 300, now) : null,
      };
    }),
    nextCursor: rows.length > limit ? hex(page[page.length - 1]!.id) : null,
  };
}

function safetyAssetUrl(r2Key: string, role: string, seconds: number, now: Date): string | null {
  try {
    const token = signMediaToken({
      k: r2Key,
      r: role,
      exp: Math.floor(now.getTime() / 1000) + seconds,
      dl: 0,
      a: "safety",
    });
    return mediaUrl(r2Key, token);
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Case view (8.2)
// ----------------------------------------------------------------------------

export async function getCase(caseId: string, reviewer: Reviewer, now: Date = new Date()) {
  const safetyCase = await loadCase(caseId);
  requireAccess(safetyCase, reviewer);
  const [item, events, creator] = await Promise.all([
    safetyCase.contentItemId
      ? prisma.contentItem.findUnique({ where: { id: Buffer.from(safetyCase.contentItemId) } })
      : null,
    prisma.safetyEvent.findMany({
      where: { caseId: safetyCase.id },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    safetyCase.creatorUserId
      ? prisma.user.findUnique({
          where: { id: safetyCase.creatorUserId },
          select: { id: true, handle: true, name: true, created_at: true, block: true },
        })
      : null,
  ]);
  const media = !noMedia(safetyCase.type) && item;
  const assets = media
    ? await prisma.contentAsset.findMany({
        where: { contentItemId: item.id },
        select: {
          role: true,
          variant: true,
          mimeType: true,
          width: true,
          height: true,
          durationMs: true,
          storage: true,
        },
      })
    : [];
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
  const [strikes, openCases, profile, reports] = await Promise.all([
    creator
      ? prisma.strike.count({
          where: { userId: creator.id, createdAt: { gte: yearAgo }, reversedAt: null },
        })
      : 0,
    creator
      ? prisma.safetyCase.count({ where: { creatorUserId: creator.id, state: { in: [...OPEN] } } })
      : 0,
    creator ? prisma.creatorAdultProfile.findUnique({ where: { userId: creator.id } }) : null,
    item
      ? prisma.contentReport.findMany({
          where: { contentItemId: item.id },
          select: { reason: true, details: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : [],
  ]);
  const settings = await getSafetySettings();
  return {
    id: hex(safetyCase.id),
    number: safetyCase.number,
    type: safetyCase.type,
    severity: safetyCase.severity,
    state: safetyCase.state,
    outcome: safetyCase.outcome,
    reasonCode: safetyCase.reasonCode,
    createdAt: safetyCase.createdAt,
    dueAt: safetyCase.dueAt,
    claimedByMe:
      safetyCase.assigneeId === reviewer.id &&
      !claimLapsed(safetyCase, settings.claimIdleMinutes, now),
    noMedia: noMedia(safetyCase.type),
    item: item
      ? {
          publicId: item.publicId,
          title: media ? item.title : null,
          description: media ? item.description : null,
          kind: item.kind,
          size: Number(item.totalBytes),
          uploadedAt: item.createdAt,
          adult: item.adult,
          aiLabel: item.aiLabel,
          sha256: item.sha256,
          status: item.status,
          moderationState: item.moderationState,
          moderationReason: item.moderationReason,
          hiddenReason: item.hiddenReason,
          assets: assets.map(asset => ({
            role: asset.role,
            variant: asset.variant,
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height,
            durationMs: asset.durationMs,
            storage: asset.storage,
          })),
        }
      : null,
    delivery: item ? await edgeStatus(item.publicId) : null,
    creator: creator
      ? {
          handle: creator.handle,
          name: creator.name,
          joined: creator.created_at,
          suspended: creator.block !== "no",
          adultOnSince: profile?.disabledAt ? null : (profile?.enabledAt ?? null),
          strikes12m: strikes,
          openCases,
        }
      : null,
    reports: media ? reports : reports.map(report => ({ ...report, details: null })),
    events: events.map(event => ({
      action: event.action,
      actorId: event.actorId,
      detail: event.detail === null ? null : JSON.stringify(event.detail),
      note: event.note,
      createdAt: event.createdAt,
    })),
  };
}

export async function claimCase(caseId: string, reviewer: Reviewer, now: Date = new Date()) {
  const safetyCase = await loadCase(caseId);
  requireAccess(safetyCase, reviewer);
  const settings = await getSafetySettings();
  if (
    safetyCase.assigneeId !== null &&
    safetyCase.assigneeId !== reviewer.id &&
    !claimLapsed(safetyCase, settings.claimIdleMinutes, now)
  ) {
    throw new SafetyActionError("conflict", "Someone else is on this case.");
  }
  await prisma.safetyCase.update({
    where: { id: safetyCase.id },
    data: {
      assigneeId: reviewer.id,
      claimedAt: now,
      ...(safetyCase.state === "OPEN" ? { state: "CLAIMED" as const } : {}),
    },
  });
  await logSafetyEvent({ caseId: safetyCase.id, actorId: reviewer.id, action: "claim" });
}

export async function releaseCase(caseId: string, reviewer: Reviewer) {
  const safetyCase = await loadCase(caseId);
  if (safetyCase.assigneeId !== reviewer.id) return;
  await prisma.safetyCase.update({
    where: { id: safetyCase.id },
    data: {
      assigneeId: null,
      claimedAt: null,
      ...(safetyCase.state === "CLAIMED" ? { state: "OPEN" as const } : {}),
    },
  });
  await logSafetyEvent({ caseId: safetyCase.id, actorId: reviewer.id, action: "release" });
}

/** One asset, unblurred, for 60 seconds. Logged. Never for child safety or Age result. */
export async function revealAsset(
  caseId: string,
  asset: { role: string; variant?: string | null },
  reviewer: Reviewer,
  now: Date = new Date()
) {
  const safetyCase = await loadCase(caseId);
  requireAccess(safetyCase, reviewer);
  if (noMedia(safetyCase.type) || !safetyCase.contentItemId) {
    throw new SafetyActionError("forbidden", "This case has no media to show.");
  }
  const row = await prisma.contentAsset.findFirst({
    where: {
      contentItemId: Buffer.from(safetyCase.contentItemId),
      role: asset.role as never,
      variant: asset.variant ?? null,
      storage: "R2",
    },
    select: { r2Key: true, role: true },
  });
  if (!row?.r2Key) throw new SafetyActionError("not_found", "That file is not stored for review.");
  const url = safetyAssetUrl(row.r2Key, row.role, SAFETY_REVEAL_SECONDS, now);
  if (!url) throw new SafetyActionError("conflict", "Media delivery is not configured.");
  await logSafetyEvent({
    caseId: safetyCase.id,
    actorId: reviewer.id,
    action: "reveal",
    detail: { role: row.role, variant: asset.variant ?? null },
  });
  return { url, expiresAt: new Date(now.getTime() + SAFETY_REVEAL_SECONDS * 1000) };
}

// ----------------------------------------------------------------------------
// Decisions (8.2)
// ----------------------------------------------------------------------------

export type DecideInput = {
  caseId: string;
  outcome: SafetyOutcome;
  reasonCode?: SafetyReasonCode;
  note: string;
  strike?: boolean;
  blockFile?: boolean;
};

async function noticeCreator(
  creatorUserId: number,
  item: Pick<ContentItem, "title">,
  subject: string,
  body: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: creatorUserId },
    select: { email: true },
  });
  if (!user?.email) return false;
  const lines = [
    body,
    `Item: ${item.title}`,
    "You can appeal this decision from the item in your library.",
  ];
  try {
    await deliverEmail({
      to: [user.email],
      subject,
      html: lines.map(line => `<p>${line.replace(/</g, "&lt;")}</p>`).join(""),
    });
    return true;
  } catch (error) {
    console.error("[safety] creator notice failed", error instanceof Error ? error.message : error);
    return false;
  }
}

export async function decideCase(input: DecideInput, reviewer: Reviewer, now: Date = new Date()) {
  const safetyCase = await loadCase(input.caseId);
  requireAccess(safetyCase, reviewer);
  if (!OPEN.includes(safetyCase.state as (typeof OPEN)[number])) {
    throw new SafetyActionError("conflict", "This case is already decided.");
  }
  if (safetyCase.type === "CHILD_SAFETY") {
    throw new SafetyActionError(
      "bad_request",
      "Child safety cases close with the CyberTipline report."
    );
  }
  if (input.note.trim().length < 10) {
    throw new SafetyActionError("bad_request", "Add a note of at least 10 characters.");
  }
  if ((input.outcome === "needs_change" || input.outcome === "removed") && !input.reasonCode) {
    throw new SafetyActionError("bad_request", "Choose a reason.");
  }
  if (input.strike && !reviewer.lead) {
    throw new SafetyActionError("forbidden", "Only a safety lead can add a strike.");
  }
  const item = safetyCase.contentItemId
    ? await prisma.contentItem.findUnique({ where: { id: Buffer.from(safetyCase.contentItemId) } })
    : null;
  if (!item) throw new SafetyActionError("bad_request", "This case has no item to decide.");

  const reason = input.reasonCode ? SAFETY_REASON_CODES[input.reasonCode] : null;
  let state: SafetyCase["state"] = "DECIDED";
  switch (input.outcome) {
    case "clear":
      await prisma.contentItem.update({
        where: { id: item.id },
        data: { moderationState: "CLEAR", moderationReason: null },
      });
      if (item.hiddenReason === "safety") await restoreItems([item.publicId]);
      else await syncEdge([item.publicId], now);
      break;
    case "label_clear": {
      const profile = item.userId
        ? await prisma.creatorAdultProfile.findUnique({ where: { userId: item.userId } })
        : null;
      if (!profile?.enabledAt || profile.disabledAt) {
        throw new SafetyActionError(
          "bad_request",
          "Label 18+ needs the creator to have 18+ turned on."
        );
      }
      await prisma.contentItem.update({
        where: { id: item.id },
        data: { adult: true, moderationState: "CLEAR", moderationReason: null },
      });
      if (item.hiddenReason === "safety") await restoreItems([item.publicId]);
      else await syncEdge([item.publicId], now);
      break;
    }
    case "needs_change":
      state = "WAITING_CREATOR";
      await prisma.contentItem.update({
        where: { id: item.id },
        data: { moderationState: "HELD", moderationReason: `safety:${input.reasonCode}` },
      });
      await noticeCreator(
        item.userId,
        item,
        "A reviewer asked for a change",
        `${reason!.creator} Change it and submit it again.`
      );
      break;
    case "removed":
      await prisma.contentItem.update({
        where: { id: item.id },
        data: { moderationState: "BLOCKED", moderationReason: `safety:${input.reasonCode}` },
      });
      await hideItems([item.publicId], "safety");
      if ((input.blockFile ?? reason!.blockDefault) && item.sha256) {
        await blockHash({
          sha256: item.sha256,
          reason: reason!.block,
          caseId: safetyCase.id,
          addedById: reviewer.id,
        });
      }
      if (input.strike) {
        await prisma.strike.create({
          data: {
            id: uuidv7(),
            userId: item.userId,
            caseId: safetyCase.id,
            reasonCode: input.reasonCode!,
          },
        });
        await logSafetyEvent({
          caseId: safetyCase.id,
          actorId: reviewer.id,
          action: "strike",
          detail: { reasonCode: input.reasonCode! },
        });
      }
      await noticeCreator(item.userId, item, "An item was removed", reason!.creator);
      break;
  }
  await prisma.safetyCase.update({
    where: { id: safetyCase.id },
    data: {
      state,
      outcome: input.outcome,
      reasonCode: input.reasonCode ?? null,
      decidedById: reviewer.id,
      decidedAt: now,
    },
  });
  await logSafetyEvent({
    caseId: safetyCase.id,
    actorId: reviewer.id,
    action: "decide",
    detail: {
      outcome: input.outcome,
      reasonCode: input.reasonCode ?? null,
      strike: Boolean(input.strike),
      blockFile:
        input.outcome === "removed" ? Boolean(input.blockFile ?? reason?.blockDefault) : false,
    },
    note: input.note.trim(),
  });
  return { state, outcome: input.outcome };
}

/**
 * Escalate (8.5). Child safety: hidden for everyone (`child_safety`, no reveal ever
 * again), a Critical case for the safety lead, the evidence copy and the alert.
 * Trafficking or coercion: a Critical case for the safety lead, without the media lock.
 */
export async function escalateCase(
  input: { caseId: string; kind: "child_safety" | "trafficking"; note: string },
  reviewer: Reviewer
) {
  const safetyCase = await loadCase(input.caseId);
  requireAccess(safetyCase, reviewer);
  if (input.note.trim().length < 10) {
    throw new SafetyActionError("bad_request", "Add a note of at least 10 characters.");
  }
  const item = safetyCase.contentItemId
    ? await prisma.contentItem.findUnique({
        where: { id: Buffer.from(safetyCase.contentItemId) },
        select: { id: true, publicId: true, userId: true },
      })
    : null;
  if (input.kind === "child_safety" && item) {
    await hideItems([item.publicId], "child_safety");
  }
  const opened = await openCase({
    type: input.kind === "child_safety" ? "CHILD_SAFETY" : "REPORT",
    severity: 0,
    contentItemId: input.kind === "child_safety" ? (item?.id ?? null) : null,
    creatorUserId: safetyCase.creatorUserId,
    parentCaseId: safetyCase.id,
    actorId: reviewer.id,
    source: input.kind === "child_safety" ? "escalation" : "trafficking",
    note: input.note.trim(),
  });
  if (input.kind === "child_safety" && item && !opened.joined) {
    await Promise.all([
      preserveEvidence(opened.case.id, item.publicId, { actorId: reviewer.id }),
      sendChildSafetyAlert(opened.case.id),
    ]);
  }
  if (input.kind === "trafficking" && !opened.joined) {
    await prisma.safetyCase.update({
      where: { id: opened.case.id },
      data: { reasonCode: "trafficking" },
    });
  }
  await prisma.safetyCase.update({
    where: { id: safetyCase.id },
    data: {
      state: "DECIDED",
      outcome: "escalated",
      decidedById: reviewer.id,
      decidedAt: new Date(),
    },
  });
  await logSafetyEvent({
    caseId: safetyCase.id,
    actorId: reviewer.id,
    action: "escalate",
    detail: { kind: input.kind, to: opened.case.number },
    note: input.note.trim(),
  });
  return { number: opened.case.number };
}

/** Retry now on the delivery line (safety lead, C7a 4.6). */
export async function retryDelivery(caseId: string, reviewer: Reviewer) {
  const safetyCase = await loadCase(caseId);
  if (!reviewer.lead)
    throw new SafetyActionError("forbidden", "Only a safety lead can retry delivery.");
  if (!safetyCase.contentItemId)
    throw new SafetyActionError("bad_request", "No item on this case.");
  const item = await prisma.contentItem.findUnique({
    where: { id: Buffer.from(safetyCase.contentItemId) },
    select: { publicId: true },
  });
  if (!item) throw new SafetyActionError("not_found", "Item not found.");
  await syncEdge([item.publicId]);
  await logSafetyEvent({ caseId: safetyCase.id, actorId: reviewer.id, action: "retry_delivery" });
  return edgeStatus(item.publicId);
}

// ----------------------------------------------------------------------------
// Blocked files (8.7, board ad6b)
// ----------------------------------------------------------------------------

export async function listBlockedFiles(query: {
  search?: string;
  cursor?: string;
  limit?: number;
}) {
  const limit = Math.min(query.limit ?? 50, 100);
  const search = query.search?.trim().toLowerCase() ?? "";
  let caseId: Buffer | null = null;
  if (/^(sc|cn)-\d{4}-\d{6}$/i.test(search)) {
    const found = await prisma.safetyCase.findUnique({
      where: { number: search.toUpperCase() },
      select: { id: true },
    });
    caseId = found ? Buffer.from(found.id) : Buffer.alloc(16);
  }
  const rows = await prisma.blockedContentHash.findMany({
    where: {
      ...(caseId
        ? { caseId }
        : search && /^[0-9a-f]{4,64}$/.test(search)
          ? { sha256: { startsWith: search } }
          : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(query.cursor && /^[0-9a-f]{32}$/.test(query.cursor)
      ? { cursor: { id: bytes(query.cursor) }, skip: 1 }
      : {}),
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const caseIds = page.flatMap(row => (row.caseId ? [Buffer.from(row.caseId)] : []));
  const adderIds = [...new Set(page.flatMap(row => (row.addedById ? [row.addedById] : [])))];
  const [cases, adders] = await Promise.all([
    caseIds.length
      ? prisma.safetyCase.findMany({
          where: { id: { in: caseIds } },
          select: { id: true, number: true },
        })
      : [],
    adderIds.length
      ? prisma.user.findMany({ where: { id: { in: adderIds } }, select: { id: true, name: true } })
      : [],
  ]);
  const numberOf = new Map<string, string>(cases.map(row => [hex(row.id), row.number] as const));
  const nameOf = new Map<number, string>(adders.map(row => [row.id, row.name] as const));
  return {
    items: page.map(row => ({
      id: hex(row.id),
      sha256: row.sha256.slice(0, 12),
      reason: row.reason,
      phash: Boolean(row.phash),
      caseNumber: row.caseId ? (numberOf.get(hex(row.caseId)) ?? null) : null,
      addedBy: row.addedById ? (nameOf.get(row.addedById) ?? "Staff") : "System",
      addedAt: row.createdAt,
      removedAt: row.removedAt,
    })),
    nextCursor: rows.length > limit ? hex(page[page.length - 1]!.id) : null,
  };
}

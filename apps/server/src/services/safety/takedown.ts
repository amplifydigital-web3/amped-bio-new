/**
 * Take It Down requests and copyright notices (adult content review 7.1 to 7.5, PR R3).
 *
 * Take It Down: a request valid on its face (all five parts, and every link points
 * to an Amped item) hides the items at once (decision D5), with exact sha256 copies
 * across all creators, and opens a Take It Down case on a 48 hour legal clock. A
 * request missing a part still gets a number and "We need one more thing"; nothing
 * is hidden yet.
 *
 * Copyright: a complete notice opens a Copyright case (1 business day). The item is
 * not hidden on receipt: the reviewer decides. A counter notice from the item's owner
 * sets the 10 to 14 business day restore window.
 *
 * Contact details and signatures are encrypted at rest. A sender reads status with
 * the number and a key only they hold (stored as a sha256). The creator never sees
 * who asked in a Take It Down request.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma, type TakedownRequest } from "@repo/database";
import {
  COUNTER_RESTORE_BY_DAYS,
  COUNTER_RESTORE_FROM_DAYS,
  SAFETY_NUMBER_PREFIX,
  TAKEDOWN_FLAG_PER_CREATOR,
  TAKEDOWN_FLAG_WINDOW_HOURS,
  TAKE_IT_DOWN_LEGAL_HOURS,
  safetyNumber,
  type CopyrightSubmit,
  type CounterNotice,
  type TakedownStatus,
  type TakedownSubmit,
} from "@repo/constants";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";
import { deliverEmail } from "../../utils/email/transport";
import { hideItems } from "../content/edge";
import { safetyBox } from "./crypto";
import { logSafetyEvent } from "./events";
import { openCase } from "./cases";
import { addBusinessDays } from "./time";

const ITEM_PATH = /^\/(?:@)?([^/]+)\/(?:c|adult)\/([A-Za-z0-9_-]{16})\/?$/;

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** The publicId an Amped link points to, or null. Exported for tests. */
export function publicIdFromLink(link: string): string | null {
  try {
    const url = new URL(link);
    const landing = new URL(env.LANDINGPAGE_URL || "https://amped.bio");
    const host = url.hostname.replace(/^www\./, "");
    if (host !== landing.hostname.replace(/^www\./, "") && host !== "amped.bio") return null;
    return ITEM_PATH.exec(url.pathname)?.[2] ?? null;
  } catch {
    return null;
  }
}

async function nextRequestNumber(prefix: string, year: number): Promise<string> {
  const last = await prisma.takedownRequest.findFirst({
    where: { number: { startsWith: `${prefix}-${year}-` } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return safetyNumber(prefix, year, last ? Number(last.number.split("-")[2]) + 1 : 1);
}

function statusUrl(path: "takedown" | "copyright", number: string, key: string) {
  const base = (env.LANDINGPAGE_URL || "https://amped.bio").replace(/\/$/, "");
  return `${base}/${path}/${number}?k=${key}`;
}

async function email(to: string, subject: string, lines: string[]) {
  try {
    await deliverEmail({
      to: [to],
      subject,
      html: lines.map(line => `<p>${line.replace(/</g, "&lt;")}</p>`).join(""),
    });
  } catch (error) {
    console.error("[safety] notice email failed", error instanceof Error ? error.message : error);
  }
}

type Located = { url: string; publicId: string | null };

async function resolveLinks(links: string[]) {
  const located: Located[] = links.map(url => ({ url, publicId: publicIdFromLink(url) }));
  const ids = located.flatMap(entry => (entry.publicId ? [entry.publicId] : []));
  const items = ids.length
    ? await prisma.contentItem.findMany({
        where: { publicId: { in: ids } },
        select: { id: true, publicId: true, userId: true, sha256: true },
      })
    : [];
  return { located, items };
}

// ----------------------------------------------------------------------------
// Take It Down (7.2, 7.3)
// ----------------------------------------------------------------------------

/** The parts a Take It Down request still needs. Exported for tests. */
export function takedownMissing(
  input: TakedownSubmit,
  located: Located[],
  found: number
): string[] {
  const missing: string[] = [];
  const hasPlace = located.length > 0 || (input.handle && input.description);
  if (!hasPlace) missing.push("where");
  if (located.some(entry => !entry.publicId) || found < located.filter(e => e.publicId).length) {
    missing.push("link");
  }
  if (!input.goodFaith) missing.push("statement");
  if (input.relationship === "agent" && !input.agentDetail) missing.push("relationship");
  if (input.signature.trim().length < 2) missing.push("signature");
  return missing;
}

export async function submitTakedown(input: TakedownSubmit, now: Date = new Date()) {
  const { located, items } = await resolveLinks(input.links);
  const missing = takedownMissing(input, located, items.length);
  const valid = missing.length === 0 && items.length > 0;
  const key = randomBytes(24).toString("base64url");
  const number = await nextRequestNumber(SAFETY_NUMBER_PREFIX.takedown, now.getUTCFullYear());
  const request = await prisma.takedownRequest.create({
    data: {
      id: uuidv7(),
      number,
      kind: "ncii",
      statusKeyHash: hashKey(key),
      relationship: input.relationship,
      agentDetail: input.agentDetail ?? null,
      contactEmail: safetyBox.encrypt(input.email)!,
      contactPhone: safetyBox.encrypt(input.phone ?? null),
      signature: safetyBox.encrypt(input.signature) ?? "",
      statement:
        [input.goodFaith ? "good_faith" : null, input.detail, input.description]
          .filter(Boolean)
          .join("\n\n") || null,
      locations: located.map(entry => ({
        url: entry.url,
        publicId: entry.publicId,
        ...(input.handle ? { handle: input.handle } : {}),
      })),
      receivedAt: now,
      dueAt: new Date(now.getTime() + TAKE_IT_DOWN_LEGAL_HOURS * 3_600_000),
    },
  });

  let hidden: string[] = [];
  if (valid) {
    // Exact copies across every creator are hidden with the reported items (7.3)
    const hashes = items.flatMap(item => (item.sha256 ? [item.sha256] : []));
    const copies = hashes.length
      ? await prisma.contentItem.findMany({
          where: { sha256: { in: hashes } },
          select: { publicId: true },
        })
      : [];
    hidden = [...new Set([...items.map(item => item.publicId), ...copies.map(c => c.publicId)])];
    await hideItems(hidden, "take_it_down");
    const creators = [...new Set(items.map(item => item.userId))];
    const opened = await openCase({
      type: "TAKE_IT_DOWN",
      requestId: request.id,
      contentItemId: items[0]!.id,
      creatorUserId: creators[0] ?? null,
      source: "takedown",
    });
    await flagIfBurst(request, creators, opened.case.id, now);
    await logSafetyEvent({
      caseId: opened.case.id,
      action: "takedown_hidden",
      detail: { request: number, items: hidden },
    });
  }
  if (missing.length) {
    await logSafetyEvent({ action: "request_missing", detail: { request: number, missing } });
  }
  await email(input.email, `Take It Down request ${number}`, [
    `We received your request ${number}.`,
    valid
      ? "We hid the items while a reviewer checks them. We decide within 48 hours."
      : "We need one more thing before we can act. Open the link below to see what is missing.",
    statusUrl("takedown", number, key),
  ]);
  return { number, key, valid, missing, hidden: hidden.length };
}

/** Many requests against one creator in a short window are flagged for the reviewer (7.3). */
async function flagIfBurst(
  request: TakedownRequest,
  creators: number[],
  caseId: Uint8Array,
  now: Date
) {
  if (!creators.length) return;
  const since = new Date(now.getTime() - TAKEDOWN_FLAG_WINDOW_HOURS * 3_600_000);
  const recent = await prisma.safetyCase.count({
    where: {
      type: "TAKE_IT_DOWN",
      creatorUserId: { in: creators },
      createdAt: { gte: since },
    },
  });
  if (recent > TAKEDOWN_FLAG_PER_CREATOR) {
    await logSafetyEvent({
      caseId,
      action: "abuse_flag",
      detail: { request: request.number, recentForCreator: recent },
    });
  }
}

// ----------------------------------------------------------------------------
// Copyright notices and counter notices (7.5)
// ----------------------------------------------------------------------------

export function copyrightMissing(
  input: CopyrightSubmit,
  located: Located[],
  found: number
): string[] {
  const missing: string[] = [];
  if (input.work.trim().length < 3) missing.push("work");
  if (!located.length) missing.push("where");
  if (located.some(entry => !entry.publicId) || found < located.length) missing.push("link");
  if (input.name.trim().length < 2) missing.push("name");
  if (input.postalAddress.trim().length < 5) missing.push("postal_address");
  if (!input.goodFaith) missing.push("good_faith");
  if (!input.accurate) missing.push("accuracy");
  if (input.signature.trim().length < 2) missing.push("signature");
  return missing;
}

export async function submitCopyright(input: CopyrightSubmit, now: Date = new Date()) {
  const { located, items } = await resolveLinks(input.links);
  const missing = copyrightMissing(input, located, items.length);
  const complete = missing.length === 0;
  const key = randomBytes(24).toString("base64url");
  const number = await nextRequestNumber(SAFETY_NUMBER_PREFIX.copyright, now.getUTCFullYear());
  const request = await prisma.takedownRequest.create({
    data: {
      id: uuidv7(),
      number,
      kind: "copyright",
      statusKeyHash: hashKey(key),
      relationship: "self",
      agentDetail: safetyBox.encrypt(input.name),
      contactEmail: safetyBox.encrypt(input.email)!,
      contactPhone: safetyBox.encrypt(input.phone ?? null),
      postalAddress: safetyBox.encrypt(input.postalAddress),
      signature: safetyBox.encrypt(input.signature) ?? "",
      workDescription: [input.work, input.workLink].filter(Boolean).join("\n"),
      statement: [input.goodFaith ? "good_faith" : null, input.accurate ? "accurate" : null]
        .filter(Boolean)
        .join(","),
      locations: located.map(entry => ({ url: entry.url, publicId: entry.publicId })),
      receivedAt: now,
      dueAt: addBusinessDays(now, 1),
    },
  });
  if (complete) {
    await openCase({
      type: "COPYRIGHT",
      requestId: request.id,
      contentItemId: items[0]!.id,
      creatorUserId: items[0]!.userId,
      source: "copyright_notice",
    });
  }
  if (missing.length) {
    await logSafetyEvent({ action: "request_missing", detail: { request: number, missing } });
  }
  await email(input.email, `Copyright notice ${number}`, [
    `We received your notice ${number}.`,
    complete
      ? "A reviewer decides within 1 business day."
      : "We need one more thing. Open the link below to see what is missing.",
    statusUrl("copyright", number, key),
  ]);
  return { number, key, valid: complete, missing };
}

/** A counter notice from the item's owner (512(g)(3)). */
export async function submitCounterNotice(
  userId: number,
  input: CounterNotice,
  now: Date = new Date()
) {
  const notice = await prisma.takedownRequest.findUnique({ where: { number: input.number } });
  if (!notice || notice.kind !== "copyright" || notice.outcome !== "removed") return null;
  const ids = (notice.locations as Array<{ publicId: string | null }>).flatMap(l =>
    l.publicId ? [l.publicId] : []
  );
  const owned = await prisma.contentItem.count({ where: { publicId: { in: ids }, userId } });
  if (!owned) return null;
  const key = randomBytes(24).toString("base64url");
  const number = await nextRequestNumber(SAFETY_NUMBER_PREFIX.counter, now.getUTCFullYear());
  const counter = await prisma.takedownRequest.create({
    data: {
      id: uuidv7(),
      number,
      kind: "counter",
      counterOfId: notice.id,
      statusKeyHash: hashKey(key),
      relationship: "self",
      agentDetail: safetyBox.encrypt(input.name),
      contactEmail: safetyBox.encrypt(`user:${userId}`)!,
      contactPhone: safetyBox.encrypt(input.phone),
      postalAddress: safetyBox.encrypt(input.postalAddress),
      signature: safetyBox.encrypt(input.signature) ?? "",
      jurisdictionConsent: input.jurisdiction && input.acceptService,
      statement: input.mistake ? "mistake" : null,
      locations: notice.locations as object,
      receivedAt: now,
      dueAt: addBusinessDays(now, COUNTER_RESTORE_BY_DAYS),
      restoreFrom: addBusinessDays(now, COUNTER_RESTORE_FROM_DAYS),
      restoreBy: addBusinessDays(now, COUNTER_RESTORE_BY_DAYS),
    },
  });
  const original = await prisma.safetyCase.findFirst({
    where: { requestId: notice.id },
    select: { id: true },
  });
  await openCase({
    type: "COPYRIGHT",
    requestId: counter.id,
    parentCaseId: original?.id ?? null,
    creatorUserId: userId,
    actorId: userId,
    source: "counter_notice",
  });
  // A copy goes to the sender with the restore window (7.5, section 14)
  const sender = safetyBox.decrypt(notice.contactEmail);
  if (sender) {
    await email(sender, `Counter notice on ${notice.number}`, [
      `The owner of the item in notice ${notice.number} sent a counter notice.`,
      `Unless you tell us you filed an action, the item is restored between ${counter.restoreFrom!.toDateString()} and ${counter.restoreBy!.toDateString()}.`,
      `Counter notice from: ${input.name}. Address: ${input.postalAddress}. Phone: ${input.phone}.`,
    ]);
  }
  return { number, restoreFrom: counter.restoreFrom!, restoreBy: counter.restoreBy! };
}

// ----------------------------------------------------------------------------
// Status page (7.2, 7.5)
// ----------------------------------------------------------------------------

export async function requestStatus(number: string, key: string): Promise<TakedownStatus | null> {
  const request = await prisma.takedownRequest.findUnique({ where: { number } });
  if (!request || request.statusKeyHash !== hashKey(key)) return null;
  const opened = await prisma.safetyCase.findFirst({
    where: { requestId: request.id },
    select: { id: true },
  });
  const locations = request.locations as Array<{ publicId: string | null }>;
  const hidden =
    request.kind === "ncii" &&
    (await prisma.contentItem.count({
      where: {
        publicId: { in: locations.flatMap(l => (l.publicId ? [l.publicId] : [])) },
        hiddenAt: { not: null },
      },
    })) > 0;
  let missing: string[] = [];
  if (!opened && request.kind !== "counter") {
    const events = await prisma.safetyEvent.findMany({
      where: { caseId: null, action: "request_missing" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const hit = events.find(
      event => (event.detail as { request?: string } | null)?.request === number
    );
    missing = ((hit?.detail as { missing?: string[] } | null)?.missing ?? ["one more thing"]).slice(
      0,
      10
    );
  }
  return {
    number: request.number,
    kind: request.kind as TakedownStatus["kind"],
    receivedAt: request.receivedAt.toISOString(),
    state: request.closedAt
      ? "decided"
      : !opened && request.kind !== "counter"
        ? "needs_more"
        : hidden
          ? "hidden"
          : "received",
    outcome: (request.outcome as TakedownStatus["outcome"]) ?? null,
    missing: request.closedAt ? [] : missing,
    restoreFrom: request.restoreFrom?.toISOString() ?? null,
    restoreBy: request.restoreBy?.toISOString() ?? null,
  };
}

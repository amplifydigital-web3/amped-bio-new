/**
 * Safety cases (adult content review 8.1 and 10, PR R1). Opening a case gives it a
 * number (SC-2026-000123), its severity and due time from the case type, and logs
 * `case_open`. One open case per item and type: a second report or hold on the same
 * item joins the open case instead of opening another.
 *
 * Deciding, claiming and the queue arrive with R2.
 */
import { Prisma, prisma, type SafetyCase } from "@repo/database";
import {
  SAFETY_CASE_DEFAULTS,
  SAFETY_NUMBER_PREFIX,
  safetyNumber,
  type SafetyCaseType,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { logSafetyEvent } from "./events";
import { caseDueAt } from "./time";

export type OpenCaseInput = {
  type: SafetyCaseType;
  /** Overrides the type's default (a trafficking escalation is Critical) */
  severity?: 0 | 1 | 2;
  /** An exact number (a copyright notice keeps its CN number); otherwise the next one */
  number?: string;
  /** False for a notice: each request needs its own case even on the same item */
  join?: boolean;
  contentItemId?: Uint8Array | null;
  offerId?: Uint8Array | null;
  storePolicyVersionId?: Uint8Array | null;
  creatorUserId?: number | null;
  requestId?: Uint8Array | null;
  parentCaseId?: Uint8Array | null;
  /** Who opened it; null for the system */
  actorId?: number | null;
  /** Why, for the log: "classifier_hold", "csam_match", "adult_label_removed" ... */
  source: string;
  note?: string | null;
  now?: Date;
};

const OPEN_STATES = ["OPEN", "CLAIMED", "WAITING_CREATOR"] as const;

/** The next number for this prefix and year. Exported for tests. */
export async function nextNumber(prefix: string, year: number): Promise<string> {
  const last = await prisma.safetyCase.findFirst({
    where: { number: { startsWith: `${prefix}-${year}-` } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const sequence = last ? Number(last.number.split("-")[2]) + 1 : 1;
  return safetyNumber(prefix, year, sequence);
}

/** The open case of this type for this item, if any. */
export async function findOpenCase(
  type: SafetyCaseType,
  contentItemId: Uint8Array
): Promise<SafetyCase | null> {
  return prisma.safetyCase.findFirst({
    where: { type, contentItemId: Buffer.from(contentItemId), state: { in: [...OPEN_STATES] } },
  });
}

/**
 * Opens a case, or returns the open one for the same item and type (`joined`).
 * Retries the number on a unique clash, so two cases opened at once both land.
 */
export async function openCase(
  input: OpenCaseInput
): Promise<{ case: SafetyCase; joined: boolean }> {
  if (input.contentItemId && input.join !== false) {
    const open = await findOpenCase(input.type, input.contentItemId);
    if (open) {
      await logSafetyEvent({
        caseId: open.id,
        actorId: input.actorId ?? null,
        action: "case_join",
        detail: { source: input.source },
        note: input.note ?? null,
      });
      return { case: open, joined: true };
    }
  }
  const now = input.now ?? new Date();
  const defaults = SAFETY_CASE_DEFAULTS[input.type];
  const prefix =
    input.type === "COPYRIGHT" ? SAFETY_NUMBER_PREFIX.copyright : SAFETY_NUMBER_PREFIX.case;
  const bytes = (value: Uint8Array | null | undefined) => (value ? Buffer.from(value) : null);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const number = input.number ?? (await nextNumber(prefix, now.getUTCFullYear()));
    try {
      const created = await prisma.safetyCase.create({
        data: {
          id: uuidv7(),
          number,
          type: input.type,
          severity: input.severity ?? defaults.severity,
          dueAt: caseDueAt(input.type, now),
          contentItemId: bytes(input.contentItemId),
          offerId: bytes(input.offerId),
          storePolicyVersionId: bytes(input.storePolicyVersionId),
          creatorUserId: input.creatorUserId ?? null,
          requestId: bytes(input.requestId),
          parentCaseId: bytes(input.parentCaseId),
          createdAt: now,
        },
      });
      await logSafetyEvent({
        caseId: created.id,
        actorId: input.actorId ?? null,
        action: "case_open",
        detail: { type: input.type, source: input.source, number },
        note: input.note ?? null,
      });
      return { case: created, joined: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // An explicit number (a notice number) can not be renumbered; only an
        // allocated one may take the next in the sequence
        if (input.number) throw error;
        continue;
      }
      throw error;
    }
  }
  throw new Error(`[safety] could not number a ${input.type} case`);
}

/** Open, overdue and due today counts plus the oldest open Take It Down request (8.1 tiles). */
export async function caseOverview(
  now: Date = new Date(),
  options: { lead?: boolean } = {}
) {
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);
  // The queue hides child safety from moderators (8.8), so the tiles must not
  // count them either: the count alone tells a moderator a case exists.
  const open = {
    state: { in: [...OPEN_STATES] },
    ...(options.lead === false ? { type: { not: "CHILD_SAFETY" as const } } : {}),
  };
  const [openCount, overdue, dueToday, byType, oldestTakedown] = await Promise.all([
    prisma.safetyCase.count({ where: open }),
    prisma.safetyCase.count({ where: { ...open, dueAt: { lt: now } } }),
    prisma.safetyCase.count({ where: { ...open, dueAt: { gte: now, lte: endOfDay } } }),
    prisma.safetyCase.groupBy({ by: ["type"], where: open, _count: { _all: true } }),
    prisma.takedownRequest.findFirst({
      where: { kind: "ncii", closedAt: null },
      orderBy: { receivedAt: "asc" },
      select: { number: true, receivedAt: true, dueAt: true },
    }),
  ]);
  return {
    open: openCount,
    overdue,
    dueToday,
    byType: Object.fromEntries(byType.map(row => [row.type, row._count._all])) as Partial<
      Record<SafetyCaseType, number>
    >,
    takedownClock: oldestTakedown
      ? {
          number: oldestTakedown.number,
          receivedAt: oldestTakedown.receivedAt,
          dueAt: oldestTakedown.dueAt,
        }
      : null,
  };
}

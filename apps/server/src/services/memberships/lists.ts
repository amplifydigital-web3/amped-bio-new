/**
 * Membership lists (MB-1). The fan's own memberships (Library, Memberships reads these in
 * FL-7) and the creator's members (People, Members, board mb1). Members show name and
 * handle only; never an email or a wallet.
 */
import { prisma } from "@repo/database";
import {
  graceDay,
  type MemberRow,
  type MembershipInterval,
  type MembershipMine,
  type MembershipStatus,
} from "@repo/constants";
import { accessUntil } from "./plans";

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");
const PAGE = 50;
const LISTED = ["active", "past_due", "canceled", "ended"] as const;

export async function listMine(fanUserId: number, now = new Date()): Promise<MembershipMine[]> {
  const rows = await prisma.membership.findMany({
    where: { fanUserId, status: { in: [...LISTED] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      plan: { select: { name: true } },
      creator: { select: { handle: true, name: true } },
    },
  });
  return rows.map(row => ({
    id: hex(row.id),
    creator: { handle: row.creator?.handle ?? "", name: row.creator?.name ?? null },
    planName: row.plan.name,
    interval: row.interval as MembershipInterval,
    amount: row.pricePerPeriod.toString(),
    status: row.status as MembershipStatus,
    accessUntil: accessUntil(row, now)?.toISOString() ?? null,
    nextChargeAt:
      row.status === "active" && !row.renewalPausedAt
        ? (row.currentPeriodEnd?.toISOString() ?? null)
        : null,
    graceDay:
      row.status === "past_due" && row.pastDueSince ? graceDay(row.pastDueSince, now) : null,
  }));
}

function memberState(row: {
  status: string;
  notReadyAt: Date | null;
  renewalPausedAt: Date | null;
}): MemberRow["state"] {
  if (row.status === "ended") return "ended";
  if (row.status === "past_due") return "in_grace";
  if (row.renewalPausedAt) return "renewal_paused";
  if (row.notReadyAt) return "not_ready";
  return "active";
}

export async function listMembers(
  creatorUserId: number,
  input: {
    filter?: "all" | "every_30_days" | "yearly" | "in_grace" | "ended";
    cursor?: string;
  } = {},
  now = new Date()
): Promise<{ rows: MemberRow[]; nextCursor: string | null }> {
  const filter = input.filter ?? "all";
  const rows = await prisma.membership.findMany({
    where: {
      creatorUserId,
      ...(filter === "ended"
        ? { status: "ended" }
        : filter === "in_grace"
          ? { status: "past_due" }
          : filter === "all"
            ? { status: { in: [...LISTED] } }
            : { status: { in: ["active", "past_due", "canceled"] }, interval: filter }),
    },
    ...(input.cursor ? { cursor: { id: Buffer.from(input.cursor, "hex") }, skip: 1 } : {}),
    orderBy: { id: "desc" },
    take: PAGE + 1,
    include: { fan: { select: { name: true, handle: true } } },
  });
  const page = rows.slice(0, PAGE);
  return {
    rows: page.map(row => ({
      id: hex(row.id),
      member: row.fan ? { name: row.fan.name, handle: row.fan.handle } : null,
      interval: row.interval as MembershipInterval,
      amount: row.pricePerPeriod.toString(),
      state: memberState(row),
      graceDay:
        row.status === "past_due" && row.pastDueSince ? graceDay(row.pastDueSince, now) : null,
      accessUntil: accessUntil(row, now)?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      joinedAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > PAGE ? hex(page[page.length - 1]!.id) : null,
  };
}

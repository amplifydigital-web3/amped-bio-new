/**
 * Membership plans (MB-1; memberships spec 3.2, decision 6 and 7, amendment 1 3.1). One plan
 * per creator. A changed amount bumps the version, so current members keep their terms ("New
 * amounts apply to new members only"). Activating needs the fresh seller check and a published
 * store policy, like a product (C9). The plan editor UI is MB-2 (st4).
 */
import { prisma } from "@repo/database";
import {
  MEMBERSHIP_ACCESS_STATUSES,
  MEMBERSHIP_AMOUNT_BOUNDS,
  MEMBERSHIP_LIMITS,
  type MembershipPlanOut,
  type MembershipPlanPublic,
  type MembershipPlanStatus,
  type MembershipPlanUpsert,
  type MembershipStatus,
  yearlySavingPercent,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { checkIdentity } from "../identity/checks";
import { liveVersion, versionCoversMemberships, versionSummary } from "../store/policy";

export type PlanErrorCode =
  | "amount_every_30_days"
  | "amount_yearly"
  | "not_found"
  | "policy"
  | "seller";

export class PlanError extends Error {
  constructor(
    readonly code: PlanErrorCode,
    readonly detail: Record<string, unknown> = {}
  ) {
    super(code);
    this.name = "PlanError";
  }
}

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");

type PlanRow = {
  id: Uint8Array;
  name: string;
  description: string | null;
  benefits: unknown;
  amountEvery30Days: bigint;
  amountYearly: bigint | null;
  status: string;
  version: number;
  showMemberCount: boolean;
};

function benefitsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((b): b is string => typeof b === "string") : [];
}

/** Members whose access has not run out, for the count and the tile. */
export async function activeMemberCount(planId: Uint8Array, now = new Date()): Promise<number> {
  return prisma.membership.count({
    where: {
      planId: Buffer.from(planId),
      status: { in: [...MEMBERSHIP_ACCESS_STATUSES] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }, { status: "past_due" }],
    },
  });
}

function planOut(row: PlanRow, activeMembers: number): MembershipPlanOut {
  return {
    id: hex(row.id),
    name: row.name,
    description: row.description,
    benefits: benefitsOf(row.benefits),
    amountEvery30Days: row.amountEvery30Days.toString(),
    amountYearly: row.amountYearly?.toString() ?? null,
    yearlySavingPercent: yearlySavingPercent(row.amountEvery30Days, row.amountYearly),
    status: row.status as MembershipPlanStatus,
    showMemberCount: row.showMemberCount,
    version: row.version,
    activeMembers,
  };
}

export async function getPlan(creatorUserId: number): Promise<MembershipPlanOut | null> {
  const row = await prisma.membershipPlan.findUnique({ where: { creatorUserId } });
  return row ? planOut(row, await activeMemberCount(row.id)) : null;
}

/** Checks both amounts against decision 7. Returns them as bigint. */
export function validAmounts(
  input: Pick<MembershipPlanUpsert, "amountEvery30Days" | "amountYearly">
) {
  const every30 = BigInt(input.amountEvery30Days);
  const b30 = MEMBERSHIP_AMOUNT_BOUNDS.every_30_days;
  if (every30 < b30.min || every30 > b30.max) throw new PlanError("amount_every_30_days");
  const yearly = input.amountYearly ? BigInt(input.amountYearly) : null;
  const by = MEMBERSHIP_AMOUNT_BOUNDS.yearly;
  if (yearly !== null && (yearly < by.min || yearly > by.max)) throw new PlanError("amount_yearly");
  return { every30, yearly };
}

/** Creates or edits the plan. A new amount is a new version. A new plan starts as a draft. */
export async function upsertPlan(
  creatorUserId: number,
  input: MembershipPlanUpsert
): Promise<MembershipPlanOut> {
  const { every30, yearly } = validAmounts(input);
  const data = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    benefits: input.benefits.slice(0, MEMBERSHIP_LIMITS.benefitsMax),
    amountEvery30Days: every30,
    amountYearly: yearly,
    showMemberCount: input.showMemberCount,
  };
  const existing = await prisma.membershipPlan.findUnique({ where: { creatorUserId } });
  if (!existing) {
    const row = await prisma.membershipPlan.create({
      data: { id: uuidv7(), creatorUserId, status: "draft", version: 1, ...data },
    });
    return planOut(row, 0);
  }
  const amountsChanged =
    existing.amountEvery30Days !== every30 || (existing.amountYearly ?? null) !== yearly;
  const row = await prisma.membershipPlan.update({
    where: { creatorUserId },
    data: { ...data, ...(amountsChanged ? { version: { increment: 1 } } : {}) },
  });
  return planOut(row, await activeMemberCount(row.id));
}

/** Active takes new members; paused stops new joins. Current members are never touched here. */
export async function setPlanStatus(
  creatorUserId: number,
  status: MembershipPlanStatus
): Promise<MembershipPlanOut> {
  const plan = await prisma.membershipPlan.findUnique({ where: { creatorUserId } });
  if (!plan) throw new PlanError("not_found");
  if (status === "active" && plan.status !== "active") {
    // The live store policy must carry section 5, Memberships (MB-2, store policy 5.2)
    const live = await liveVersion(creatorUserId);
    if (!live || !versionCoversMemberships(live)) throw new PlanError("policy");
    const seller = await checkIdentity(creatorUserId, "seller", { fresh: true });
    if (!seller.pass) throw new PlanError("seller", { reason: seller.reason });
  }
  const row = await prisma.membershipPlan.update({ where: { creatorUserId }, data: { status } });
  return planOut(row, await activeMemberCount(row.id));
}

/** The viewer's own latest membership with this creator, if any. */
export async function viewerMembership(viewerId: number, creatorUserId: number) {
  return prisma.membership.findFirst({
    where: {
      fanUserId: viewerId,
      creatorUserId,
      status: { in: ["active", "past_due", "canceled", "ended"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      currentPeriodEnd: true,
      pastDueSince: true,
      canceledAt: true,
      endedAt: true,
      planId: true,
    },
  });
}

/**
 * The renewal job runs hourly, so an active membership whose charge is one tick late must not
 * lose access in the gap between the period end and the job marking it past due. It never
 * extends past this: a row that is still active days later (the chain subscription ended
 * outside this server, or the keeper never ran) closes on its own.
 */
const ACTIVE_LAPSE_MS = MEMBERSHIP_LIMITS.activeLapseMs;

/** Until when a membership opens members only items, or null when it does not. */
export function accessUntil(
  row: { status: string; currentPeriodEnd: Date | null; pastDueSince: Date | null },
  now = new Date()
): Date | null {
  if (row.status === "active") {
    if (!row.currentPeriodEnd) return null;
    if (row.currentPeriodEnd > now) return row.currentPeriodEnd;
    const late = new Date(row.currentPeriodEnd.getTime() + ACTIVE_LAPSE_MS);
    return late > now ? late : null;
  }
  if (row.status === "past_due" && row.pastDueSince) {
    const end = new Date(row.pastDueSince.getTime() + MEMBERSHIP_LIMITS.graceDays * 86_400_000);
    return end > now ? end : null;
  }
  if (row.status === "canceled" && row.currentPeriodEnd && row.currentPeriodEnd > now) {
    return row.currentPeriodEnd;
  }
  return null;
}

/**
 * True while the viewer may open this creator's members only items (G5 reads this). Active
 * members pass their paid period (one keeper tick of slack); past due keeps access through the
 * 7 day grace; canceled keeps it to the period end.
 */
export async function isMember(viewerId: number, creatorUserId: number, now = new Date()) {
  const row = await viewerMembership(viewerId, creatorUserId);
  if (!row) return false;
  return accessUntil(row, now) !== null;
}

/** The plan anyone sees (store and bio, MB-2). No count under 10 members (board mb10). */
export async function publicPlan(
  handle: string,
  viewerId: number | null,
  now = new Date()
): Promise<MembershipPlanPublic | null> {
  const creator = await prisma.user.findFirst({
    where: { handle: handle.replace(/^@/, "").toLowerCase() },
    select: { id: true, handle: true, name: true, membershipPlan: true },
  });
  const plan = creator?.membershipPlan;
  if (!creator || !plan || plan.status !== "active") return null;
  const live = await liveVersion(creator.id);
  const summary = live ? versionSummary(live) : null;
  const count = await activeMemberCount(plan.id, now);
  const mine = viewerId ? await viewerMembership(viewerId, creator.id) : null;
  return {
    id: hex(plan.id),
    handle: creator.handle!,
    sellerName: summary?.sellerName ?? creator.name ?? `@${creator.handle}`,
    policyVersion: summary?.version ?? null,
    name: plan.name,
    description: plan.description,
    benefits: benefitsOf(plan.benefits),
    amountEvery30Days: plan.amountEvery30Days.toString(),
    amountYearly: plan.amountYearly?.toString() ?? null,
    yearlySavingPercent: yearlySavingPercent(plan.amountEvery30Days, plan.amountYearly),
    memberCount: plan.showMemberCount && count >= MEMBERSHIP_LIMITS.memberCountFloor ? count : null,
    viewer: mine
      ? {
          status: mine.status as MembershipStatus,
          accessUntil: accessUntil(mine, now)?.toISOString() ?? null,
        }
      : null,
  };
}

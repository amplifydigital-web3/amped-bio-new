import { prisma } from "@repo/database";
import { accessUntil, viewerMembership } from "../../memberships/plans";
import type { MemberPlan, MembershipReader, MembershipState } from "../types";

/**
 * Memberships through AmpedMemberships (MB-1), for the `member` kind (gating spec 3.3, G5).
 * Reads the Membership rows the join, renewal and cancel paths keep. Read only.
 *
 * Access follows MB-1's `accessUntil`: active to the period end, canceled to the period
 * end, past due through the 7 day grace. The fan's newest membership with the creator
 * decides, so a rejoin after an end opens again.
 */
export const membershipReader: MembershipReader = {
  async plan(planIdHex: string): Promise<MemberPlan | null> {
    if (!/^[0-9a-f]{32}$/.test(planIdHex)) return null;
    const row = await prisma.membershipPlan.findUnique({
      where: { id: Buffer.from(planIdHex, "hex") },
      select: { creatorUserId: true, status: true, amountEvery30Days: true },
    });
    if (!row) return null;
    return {
      ownerUserId: row.creatorUserId,
      status: row.status,
      amountEvery30Days: row.amountEvery30Days,
    };
  },

  async membership(
    userId: number,
    creatorUserId: number,
    now: Date = new Date()
  ): Promise<MembershipState> {
    const row = await viewerMembership(userId, creatorUserId);
    if (!row) return "none";
    const until = accessUntil(row, now);
    if (!until) return "ended";
    return row.status === "past_due" ? "grace" : "active";
  },
};

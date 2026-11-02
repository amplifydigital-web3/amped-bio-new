import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TelegramGroup } from "@repo/database";
import { DM_RULE_KINDS, TELEGRAM_GROUP_STRINGS as G, type DmRuleKind } from "@repo/constants";
import { privateProcedure, router } from "../trpc";
import { env } from "../../env";
import { enforceRateLimits } from "../../utils/rateLimit";
import { hexToId, idToHex } from "../../services/analytics/ids";
import {
  GroupError,
  connectGroup,
  connectPublicGroup,
  disconnectGroup,
  groupWeek,
  listCreatorGroups,
  previewRule,
  queueGroupCheck,
  setGroupRule,
  setRemoveUnverified,
} from "../../services/telegram/groups";

const idSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/)
  .transform(hexToId);
const ruleSchema = z.object({
  ruleKind: z.enum(DM_RULE_KINDS),
  stakeMin: z.string().max(30).nullable().default(null),
});

const MESSAGES: Record<GroupError["code"], { code: TRPCError["code"]; message: string }> = {
  off: { code: "PRECONDITION_FAILED", message: G.off },
  not_found: { code: "NOT_FOUND", message: G.notFoundPublic },
  not_admin: { code: "PRECONDITION_FAILED", message: G.notAdmin },
  not_your_group: { code: "FORBIDDEN", message: G.notYourGroup },
  limit: { code: "BAD_REQUEST", message: G.limitReached },
  not_linked: { code: "PRECONDITION_FAILED", message: G.notYourGroup },
  bad_rule: { code: "BAD_REQUEST", message: G.failed },
};

async function run<T>(fn: () => Promise<T>): Promise<T> {
  if (!env.TELEGRAM_GROUPS) throw new TRPCError({ code: "PRECONDITION_FAILED", message: G.off });
  try {
    return await fn();
  } catch (error) {
    if (error instanceof GroupError) throw new TRPCError(MESSAGES[error.code]);
    console.error("[telegram] groups procedure failed", error);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: G.failed });
  }
}

/** What the creator's card shows. The chat id never leaves the server. */
function view(group: TelegramGroup) {
  return {
    id: idToHex(group.id),
    title: group.title,
    state: group.connectedAt ? ("connected" as const) : ("pending" as const),
    botIsAdmin: group.botIsAdmin,
    ruleKind: group.ruleKind as DmRuleKind,
    stakeMin: group.stakeMin,
    inviteLink: group.inviteLink,
    memberCount: group.memberCount,
    removeUnverified: group.removeUnverified,
    lastCheckedAt: group.lastCheckedAt,
    connectedAt: group.connectedAt,
  };
}

/**
 * telegram.groups (Build Board #2, phase 2, spec r3 3.2 and 3.4, boards tg5 and tg10).
 * Every procedure acts on the caller's own groups. Behind TELEGRAM_GROUPS.
 */
export const telegramGroupsRouter = router({
  /** Pending and connected groups with the past week's totals for connected ones. */
  list: privateProcedure.query(async ({ ctx }) => {
    if (!env.TELEGRAM_GROUPS) return { enabled: false as const, groups: [] };
    const groups = await listCreatorGroups(ctx.user!.sub);
    return {
      enabled: true as const,
      groups: await Promise.all(
        groups.map(async group => ({
          ...view(group),
          week: group.connectedAt ? await groupWeek(group.id) : null,
        }))
      ),
    };
  }),

  /** Confirm a group the bot found. */
  connect: privateProcedure
    .input(z.object({ groupId: idSchema }).merge(ruleSchema))
    .mutation(({ ctx, input }) =>
      run(async () => {
        await enforceRateLimits(
          [{ key: `tg-group-connect:${ctx.user!.sub}`, limit: 20, windowSeconds: 3600 }],
          "Too many tries. Try again in an hour."
        );
        return view(
          await connectGroup(ctx.user!.sub, input.groupId, input.ruleKind, input.stakeMin)
        );
      })
    ),

  /** Connect a public group by @username. A private invite link is refused. */
  connectPublic: privateProcedure
    .input(z.object({ username: z.string().min(1).max(80) }).merge(ruleSchema))
    .mutation(({ ctx, input }) =>
      run(async () => {
        await enforceRateLimits(
          [{ key: `tg-group-connect:${ctx.user!.sub}`, limit: 20, windowSeconds: 3600 }],
          "Too many tries. Try again in an hour."
        );
        return view(
          await connectPublicGroup(ctx.user!.sub, input.username, input.ruleKind, input.stakeMin)
        );
      })
    ),

  /** How many members a new rule would remove at the next check. */
  previewRule: privateProcedure
    .input(z.object({ groupId: idSchema }).merge(ruleSchema))
    .query(({ ctx, input }) =>
      run(() => previewRule(ctx.user!.sub, input.groupId, input.ruleKind, input.stakeMin))
    ),

  setRule: privateProcedure
    .input(z.object({ groupId: idSchema }).merge(ruleSchema))
    .mutation(({ ctx, input }) =>
      run(async () =>
        view(await setGroupRule(ctx.user!.sub, input.groupId, input.ruleKind, input.stakeMin))
      )
    ),

  setRemoveUnverified: privateProcedure
    .input(z.object({ groupId: idSchema, value: z.boolean() }))
    .mutation(({ ctx, input }) =>
      run(async () => view(await setRemoveUnverified(ctx.user!.sub, input.groupId, input.value)))
    ),

  recheck: privateProcedure.input(z.object({ groupId: idSchema })).mutation(({ ctx, input }) =>
    run(async () => {
      await enforceRateLimits(
        [{ key: `tg-group-recheck:${ctx.user!.sub}`, limit: 6, windowSeconds: 3600 }],
        "Checks run every hour. Try again later."
      );
      const groups = await listCreatorGroups(ctx.user!.sub);
      const group = groups.find(g => Buffer.compare(g.id, input.groupId) === 0);
      if (!group || !group.connectedAt) throw new GroupError("not_found");
      return { queued: await queueGroupCheck(group.id) };
    })
  ),

  disconnect: privateProcedure
    .input(z.object({ groupId: idSchema }))
    .mutation(({ ctx, input }) =>
      run(async () => view(await disconnectGroup(ctx.user!.sub, input.groupId)))
    ),
});

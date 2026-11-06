import { z } from "zod";
import { adminProcedure, router } from "../trpc";
import * as handles from "../../services/handles/admin";

/**
 * admin.handles (Build Board D2, docs/features/reserved-handles.md 7.10).
 * Admin role only (decision A3). Every mutation writes AdminAuditLog.
 */

const hexId = z.string().regex(/^[0-9a-f]{32}$/, "Invalid id");
const reason = z
  .string()
  .trim()
  .min(1, "Add a reason.")
  .max(500, "Keep the reason under 500 characters.");
const kind = z.enum(["EXACT", "PREFIX"]);
const category = z.enum(["COMPANY", "TRUST", "BRAND", "PARTNER", "HOLD"]);
const holderAction = z.enum(["keep", "notice"]);
const cursor = z.number().int().min(0).optional();
const limit = z.number().int().min(1).max(200).default(50);
const noticeInput = z.object({ noticeId: hexId, reason });
const logFilter = z.enum(["all", "reserve", "assign", "release", "notice", "expired"]);

function actor(ctx: { user?: { sub: number } | null }): number {
  // adminProcedure guarantees a signed in admin
  return ctx.user!.sub;
}

const holdersRouter = router({
  list: adminProcedure
    .input(
      z.object({
        state: z
          .enum(["open", "notice_sent", "exempt", "chose_new", "renamed", "failed"])
          .default("open"),
        cursor,
        limit,
      })
    )
    .query(({ input }) => handles.listHolders(input)),
  resend: adminProcedure
    .input(noticeInput)
    .mutation(({ ctx, input }) => handles.resendNotice(actor(ctx), input)),
  extend: adminProcedure
    .input(noticeInput)
    .mutation(({ ctx, input }) => handles.extendNotice(actor(ctx), input)),
  exempt: adminProcedure
    .input(noticeInput)
    .mutation(({ ctx, input }) => handles.exemptNotice(actor(ctx), input)),
  renameNow: adminProcedure
    .input(noticeInput)
    .mutation(({ ctx, input }) => handles.renameNow(actor(ctx), input)),
  startNotice: adminProcedure
    .input(noticeInput)
    .mutation(({ ctx, input }) => handles.startNoticeFor(actor(ctx), input)),
  retry: adminProcedure
    .input(noticeInput)
    .mutation(({ ctx, input }) => handles.retryNotice(actor(ctx), input)),
});

const redirectsRouter = router({
  list: adminProcedure
    .input(z.object({ cursor, limit }).default({}))
    .query(({ input }) =>
      handles.listRedirects({ cursor: input.cursor, limit: input.limit ?? 50 })
    ),
  end: adminProcedure
    .input(z.object({ oldHandle: z.string().min(1).max(64), reason }))
    .mutation(({ ctx, input }) => handles.endRedirect(actor(ctx), input)),
  restore: adminProcedure
    .input(z.object({ auditId: hexId }))
    .mutation(({ ctx, input }) => handles.restoreRedirect(actor(ctx), input)),
});

const logRouter = router({
  list: adminProcedure
    .input(
      z
        .object({
          action: logFilter.default("all"),
          actorId: z.number().int().nullable().optional(),
          cursor,
          limit,
        })
        .default({})
    )
    .query(({ input }) =>
      handles.listLog({
        action: input.action,
        actorId: input.actorId,
        cursor: input.cursor,
        limit: input.limit ?? 50,
      })
    ),
  actors: adminProcedure.query(() => handles.logActors()),
  export: adminProcedure
    .input(z.object({ from: z.coerce.date(), to: z.coerce.date(), action: logFilter.optional() }))
    .query(({ input }) => handles.exportLog(input)),
});

export const handlesAdminRouter = router({
  list: adminProcedure
    .input(
      z
        .object({
          filter: z
            .enum(["all", "system", "company", "trust", "brand", "partner", "hold", "assigned"])
            .default("all"),
          search: z.string().max(64).optional(),
          cursor,
          limit: z.number().int().min(1).max(500).default(200),
        })
        .default({})
    )
    .query(({ input }) =>
      handles.listWords({
        filter: input.filter ?? "all",
        search: input.search,
        cursor: input.cursor,
        limit: input.limit ?? 200,
      })
    ),
  get: adminProcedure
    .input(z.union([z.object({ id: hexId }), z.object({ word: z.string().min(1).max(64) })]))
    .query(({ input }) => handles.getWord(input)),
  checkCollisions: adminProcedure
    .input(z.object({ word: z.string().min(1).max(64), kind }))
    .query(({ input }) => handles.checkCollisions(input)),
  reserve: adminProcedure
    .input(
      z.object({
        word: z.string().min(1).max(64),
        kind,
        category,
        reason,
        expiresAt: z.coerce.date().nullable().optional(),
        defaultAction: holderAction.optional(),
        holders: z
          .array(z.object({ userId: z.number().int(), action: holderAction }))
          .max(20)
          .default([]),
      })
    )
    .mutation(({ ctx, input }) => handles.reserve(actor(ctx), input)),
  update: adminProcedure
    .input(
      z.object({
        id: hexId,
        category: category.optional(),
        reason: reason.optional(),
        expiresAt: z.coerce.date().nullable().optional(),
      })
    )
    .mutation(({ ctx, input }) => handles.update(actor(ctx), input)),
  assign: adminProcedure
    .input(
      z.object({
        id: hexId,
        userId: z.number().int(),
        reason,
        redirectOld: z.boolean().default(true),
        notify: z.boolean().default(true),
      })
    )
    .mutation(({ ctx, input }) => handles.assign(actor(ctx), input)),
  unassign: adminProcedure
    .input(z.object({ id: hexId, reason, startNotice: z.boolean().default(false) }))
    .mutation(({ ctx, input }) => handles.unassign(actor(ctx), input)),
  release: adminProcedure
    .input(z.object({ id: hexId, reason }))
    .mutation(({ ctx, input }) => handles.release(actor(ctx), input)),
  restore: adminProcedure
    .input(z.object({ auditId: hexId }))
    .mutation(({ ctx, input }) => handles.restore(actor(ctx), input)),
  /** Give reserved word on the Users slab: admin tier exact words with no holder */
  assignable: adminProcedure.query(() => handles.assignableWords()),
  holders: holdersRouter,
  redirects: redirectsRouter,
  log: logRouter,
});

/**
 * The Safety router (Build Board #28, docs/features/adult-content-review.md 8 and 13,
 * PR R1). Roles from the comma separated User.role (8.8): `moderator` and
 * `safety_lead`. `admin` alone does not open Safety. R1 carries the overview and the
 * settings; the queue, case view and decisions arrive with R2.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  SAFETY_CASE_TYPES,
  SAFETY_OUTCOMES,
  SAFETY_REASON_KEYS,
  SAFETY_ROLES,
  SAFETY_SETTINGS_DEFAULTS,
  type SafetyReasonCode,
} from "@repo/constants";
import { createRoleProtectedProcedure, router } from "./trpc";
import {
  SafetyActionError,
  claimCase,
  decideCase,
  escalateCase,
  getCase,
  listBlockedFiles,
  listQueue,
  releaseCase,
  retryDelivery,
  revealAsset,
  type Reviewer,
} from "../services/safety/review";
import { BlocklistError, unblockHash } from "../services/safety/blocklist";
import {
  decideCopyright,
  decideTakedown,
  getRequest,
  lateTakedowns,
  listRequests,
  nearCopies,
  restoreAfterCounter,
  revealContact,
  suitFiled,
} from "../services/safety/requests";
import { caseOverview } from "../services/safety/cases";
import { getSafetySettings, updateSafetySettings } from "../services/safety/settings";

export const safetyProcedure = createRoleProtectedProcedure([...SAFETY_ROLES]);
export const safetyLeadProcedure = createRoleProtectedProcedure(["safety_lead"]);

const rolesOf = (role: string | undefined) =>
  (role ?? "")
    .split(",")
    .map(r => r.trim())
    .filter(Boolean);

const onCallSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(80),
      email: z.string().trim().email().max(254).optional(),
      phone: z
        .string()
        .trim()
        .regex(/^\+[1-9]\d{6,14}$/, "Use the international format, for example +15551234567")
        .optional(),
    })
  )
  .max(20);

const settingsPatchSchema = z
  .object({
    phashThreshold: z.number().int().min(0).max(64),
    classifierThreshold: z.number().min(0).max(1),
    breakAfterMinutes: z.number().int().min(5).max(240),
    dailyCapMinutes: z.number().int().min(30).max(720),
    claimIdleMinutes: z.number().int().min(5).max(240),
    strikesToSuspend: z.number().int().min(1).max(10),
    onCall: onCallSchema,
  })
  .partial();

const caseIdSchema = z.string().regex(/^[0-9a-f]{32}$/);
const noteSchema = z.string().trim().min(10).max(2000);
const requestNumber = z.string().regex(/^(TD|CN|CC)-\d{4}-\d{6}$/);

function reviewerOf(ctx: { user?: { sub: number; role?: string } | null }): Reviewer {
  return { id: ctx.user!.sub, lead: rolesOf(ctx.user!.role).includes("safety_lead") };
}

/** Service errors become tRPC errors with the same message. */
async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SafetyActionError) {
      const code = {
        not_found: "NOT_FOUND",
        forbidden: "FORBIDDEN",
        bad_request: "BAD_REQUEST",
        conflict: "CONFLICT",
      } as const;
      throw new TRPCError({ code: code[error.code], message: error.message });
    }
    if (error instanceof BlocklistError) {
      throw new TRPCError({
        code: error.reason === "not_found" ? "NOT_FOUND" : "BAD_REQUEST",
        message:
          error.reason === "child_safety"
            ? "Child safety files can not be unblocked here."
            : error.reason === "already_removed"
              ? "This file is already unblocked."
              : "Not found.",
      });
    }
    throw error;
  }
}

export const safetyRouter = router({
  /** The viewer's Safety roles, for the admin shell. */
  me: safetyProcedure.query(({ ctx }) => {
    const roles = rolesOf(ctx.user!.role);
    return {
      moderator: roles.includes("moderator") || roles.includes("safety_lead"),
      safetyLead: roles.includes("safety_lead"),
    };
  }),

  /** Queue summary tiles (8.1): open, overdue, due today, by type, Take It Down clock. */
  overview: safetyProcedure.query(() => caseOverview()),

  queue: router({
    /** Open cases by due time (8.1). Moderators never see child safety. */
    list: safetyProcedure
      .input(
        z.object({
          type: z.enum(SAFETY_CASE_TYPES).optional(),
          severity: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
          mine: z.boolean().optional(),
          unassigned: z.boolean().optional(),
          overdue: z.boolean().optional(),
          cursor: caseIdSchema.optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
      )
      .query(({ ctx, input }) => listQueue(input, reviewerOf(ctx))),
  }),

  case: router({
    get: safetyProcedure
      .input(z.object({ id: caseIdSchema }))
      .query(({ ctx, input }) => run(() => getCase(input.id, reviewerOf(ctx)))),
    claim: safetyProcedure
      .input(z.object({ id: caseIdSchema }))
      .mutation(({ ctx, input }) => run(() => claimCase(input.id, reviewerOf(ctx)))),
    release: safetyProcedure
      .input(z.object({ id: caseIdSchema }))
      .mutation(({ ctx, input }) => run(() => releaseCase(input.id, reviewerOf(ctx)))),
    /** Logs and returns a 60 second Safety token URL for one asset (section 13). */
    reveal: safetyProcedure
      .input(
        z.object({
          id: caseIdSchema,
          role: z.enum([
            "ORIGINAL",
            "RENDITION",
            "COVER",
            "PAGE_PREVIEW",
            "WAVEFORM",
            "AUDIO_PREVIEW",
          ]),
          variant: z.string().max(16).nullable().optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        run(() =>
          revealAsset(
            input.id,
            { role: input.role, variant: input.variant ?? null },
            reviewerOf(ctx)
          )
        )
      ),
    decide: safetyProcedure
      .input(
        z.object({
          id: caseIdSchema,
          outcome: z.enum(SAFETY_OUTCOMES),
          reasonCode: z
            .string()
            .refine((v): v is SafetyReasonCode => (SAFETY_REASON_KEYS as string[]).includes(v))
            .optional(),
          note: noteSchema,
          strike: z.boolean().optional(),
          blockFile: z.boolean().optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        run(() =>
          decideCase(
            {
              caseId: input.id,
              outcome: input.outcome,
              reasonCode: input.reasonCode as SafetyReasonCode | undefined,
              note: input.note,
              strike: input.strike,
              blockFile: input.blockFile,
            },
            reviewerOf(ctx)
          )
        )
      ),
    escalate: safetyProcedure
      .input(
        z.object({
          id: caseIdSchema,
          kind: z.enum(["child_safety", "trafficking"]),
          note: noteSchema,
        })
      )
      .mutation(({ ctx, input }) =>
        run(() =>
          escalateCase({ caseId: input.id, kind: input.kind, note: input.note }, reviewerOf(ctx))
        )
      ),
    retryDelivery: safetyLeadProcedure
      .input(z.object({ id: caseIdSchema }))
      .mutation(({ ctx, input }) => run(() => retryDelivery(input.id, reviewerOf(ctx)))),
  }),

  requests: router({
    /** Take It Down and copyright requests with their clocks (8.3). */
    list: safetyProcedure
      .input(
        z.object({
          kind: z.enum(["ncii", "copyright", "counter"]).optional(),
          open: z.boolean().optional(),
        })
      )
      .query(({ input }) => listRequests(input)),
    get: safetyProcedure
      .input(z.object({ number: requestNumber }))
      .query(({ input }) => run(() => getRequest(input.number))),
    copies: safetyProcedure
      .input(z.object({ phash: z.string().regex(/^[0-9a-f]{8,64}$/) }))
      .query(({ input }) => nearCopies(input.phash)),
    late: safetyProcedure.query(() => lateTakedowns()),
    revealContact: safetyLeadProcedure
      .input(z.object({ number: requestNumber }))
      .mutation(({ ctx, input }) => run(() => revealContact(input.number, reviewerOf(ctx)))),
    decide: safetyProcedure
      .input(
        z.object({
          number: requestNumber,
          outcome: z.enum(["removed", "not_valid"]),
          note: noteSchema,
          reason: z.string().trim().max(1000).optional(),
          blockFile: z.boolean().optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        run(() =>
          input.number.startsWith("CN-")
            ? decideCopyright(input, reviewerOf(ctx))
            : decideTakedown(input, reviewerOf(ctx))
        )
      ),
    suitFiled: safetyProcedure
      .input(z.object({ number: requestNumber, reference: z.string().trim().min(3).max(120) }))
      .mutation(({ ctx, input }) => run(() => suitFiled(input, reviewerOf(ctx)))),
    restore: safetyLeadProcedure
      .input(z.object({ number: requestNumber }))
      .mutation(({ ctx, input }) => run(() => restoreAfterCounter(input.number, reviewerOf(ctx)))),
  }),

  blocklist: router({
    list: safetyProcedure
      .input(
        z.object({
          search: z.string().trim().max(64).optional(),
          cursor: caseIdSchema.optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
      )
      .query(({ input }) => listBlockedFiles(input)),
    unblock: safetyLeadProcedure
      .input(z.object({ id: caseIdSchema, reason: noteSchema }))
      .mutation(({ ctx, input }) =>
        run(async () => {
          await unblockHash(Buffer.from(input.id, "hex"), ctx.user!.sub, input.reason);
          return { ok: true as const };
        })
      ),
  }),

  settings: router({
    /** Settings (8.7). On call contacts are staff data: safety leads only. */
    get: safetyLeadProcedure.query(async () => ({
      settings: await getSafetySettings(),
      defaults: SAFETY_SETTINGS_DEFAULTS,
    })),
    update: safetyLeadProcedure
      .input(settingsPatchSchema)
      .mutation(({ ctx, input }) => updateSafetySettings(input, ctx.user!.sub)),
  }),
});

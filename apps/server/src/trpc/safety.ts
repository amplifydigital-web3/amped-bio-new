/**
 * The Safety router (Build Board #28, docs/features/adult-content-review.md 8 and 13,
 * PR R1). Roles from the comma separated User.role (8.8): `moderator` and
 * `safety_lead`. `admin` alone does not open Safety. R1 carries the overview and the
 * settings; the queue, case view and decisions arrive with R2.
 */
import { z } from "zod";
import { SAFETY_ROLES, SAFETY_SETTINGS_DEFAULTS } from "@repo/constants";
import { createRoleProtectedProcedure, router } from "./trpc";
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

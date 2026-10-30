import { z } from "zod";
import {
  IDENTITY_CHECK_KINDS,
  IDENTITY_RECHECK_PER_MINUTE,
  type IdentityCheckResult,
} from "@repo/constants";
import { privateProcedure, router } from "./trpc";
import { checkIdentity, myIdentityChecks } from "../services/identity/checks";
import { enforceRateLimits } from "../utils/rateLimit";
import { bumpViewer } from "../services/access";

/** The client sees dates as ISO strings; nothing else about the check. */
function toClient(result: IdentityCheckResult) {
  return result.pass
    ? { pass: true as const, validUntil: result.validUntil.toISOString(), tier: result.tier }
    : { pass: false as const, reason: result.reason };
}

// Identity checks (Build Board #47, docs/features/identity-checks.md). Always the
// session account's own wallet; no procedure takes an address or user id.
export const identityRouter = router({
  // Both results for the Over 18 sheet and the Get paid card
  myChecks: privateProcedure.query(async ({ ctx }) => {
    const { ageOver18, seller } = await myIdentityChecks(ctx.user!.sub);
    return { ageOver18: toClient(ageOver18), seller: toClient(seller) };
  }),

  // A fresh check after the user returns from Authbase or the Names tab
  recheck: privateProcedure
    .input(z.object({ kind: z.enum(IDENTITY_CHECK_KINDS) }))
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimits(
        [
          {
            key: `identity_recheck:${ctx.user!.sub}`,
            limit: IDENTITY_RECHECK_PER_MINUTE,
            windowSeconds: 60,
          },
        ],
        "Too many checks. Try again in a minute."
      );
      const result = await checkIdentity(ctx.user!.sub, input.kind, { fresh: true });
      // Gating (#21): an age check result changes what the viewer can open
      await bumpViewer(ctx.user!.sub, "age_check");
      return toClient(result);
    }),
});

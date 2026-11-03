import { STAKE_ACCESS_RULE_KINDS } from "@repo/constants";
import { TRPCError } from "@trpc/server";
import { env } from "../../env";

/** Shown wherever a creator outside the pilot picks a stake rule (content gating 3.5, OB-Q65). */
export const STAKE_NOT_ALLOWED_MESSAGE = "Not available for your page yet.";

/** Stake rules are live only for creators on the pilot allowlist (spec 6, flags). */
export function stakeKindsAllowed(
  ownerUserId: number,
  allowlist = env.ACCESS_STAKE_KINDS_ALLOWLIST
) {
  return allowlist
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .includes(String(ownerUserId));
}

export const isStakeKind = (kind: string) =>
  (STAKE_ACCESS_RULE_KINDS as readonly string[]).includes(kind);

/** FORBIDDEN when any kind reads a stake and the owner is outside the allowlist. */
export function assertStakeKindsAllowed(ownerUserId: number, kinds: readonly string[]) {
  if (kinds.some(isStakeKind) && !stakeKindsAllowed(ownerUserId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: STAKE_NOT_ALLOWED_MESSAGE });
  }
}

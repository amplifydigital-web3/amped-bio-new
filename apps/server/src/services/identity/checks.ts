/**
 * Identity checks through Authbase: Over 18 and verified seller (Build Board #47,
 * docs/features/identity-checks.md, PR I1). The only reader of these facts: content
 * (A1), the store and memberships (S1) and later the gating engine call
 * checkIdentity and never Authbase directly.
 *
 * Rules (spec section 3):
 * - The wallet is always the account's own UserWallet. Nothing takes an address
 *   from the client.
 * - Only the outcome, reason and dates are stored, never an attribute value.
 * - A pass is reused until the earlier of valid_until and 24 hours; a fail for
 *   5 minutes. "unavailable" is never stored or reused, so Try again reaches
 *   Authbase. fresh skips the stored row.
 * - A row for another wallet than the account's is ignored.
 * - An under 18 result opens a review case (spec 4.5); while it is open the age
 *   check never passes.
 */
import { prisma } from "@repo/database";
import {
  IDENTITY_FAIL_CACHE_MS,
  IDENTITY_PASS_CACHE_MS,
  type IdentityCheckKind,
  type IdentityCheckResult,
  type IdentityFailReason,
  type IdentityTier,
} from "@repo/constants";
import { isAddress } from "viem";
import { getAuthbaseWalletStatus, isAuthbaseConfigured } from "../authbase";
import { checkRnsBinding, type RnsBindingResult } from "../rns";
import { uuidv7 } from "../../utils/uuid-v7";
import { hasOpenUnder18Case, recordUnder18Result } from "./reviewCase";

/** What the evaluation needs from Authbase. Attribute values never leave this module. */
export type AuthbaseFacts = {
  status: "NOT_LINKED" | "NOT_VERIFIED" | "VERIFIED" | "VERIFIED_WITH_BADGE";
  tier: IdentityTier | null;
  validUntil: Date | null;
  ageOver18: "true" | "false" | null;
};

/** Seller reasons from checkRnsBinding (spec 3). Exported for tests. */
export function sellerReasonFromBinding(binding: RnsBindingResult): IdentityFailReason | null {
  if (binding.ok) return null;
  switch (binding.reason) {
    case "expired":
      return "name_expired";
    case "not_owner":
    case "addr_elsewhere":
      return "name_not_bound";
    case "no_wallet":
      return "no_wallet";
    default:
      // invalid, not_found, or no name on the account
      return "no_name";
  }
}

/**
 * The pure rule. Authbase reasons are checked first; for a seller, the RNS
 * binding second. Exported for tests.
 */
export function evaluateIdentity(
  kind: IdentityCheckKind,
  facts: AuthbaseFacts,
  binding: RnsBindingResult | null
): IdentityCheckResult {
  if (facts.status === "NOT_LINKED") return { pass: false, reason: "not_linked" };
  if (facts.status === "NOT_VERIFIED") return { pass: false, reason: "not_verified" };
  if (!facts.tier || !facts.validUntil) return { pass: false, reason: "not_verified" };

  if (kind === "age_over_18") {
    if (facts.ageOver18 === null) return { pass: false, reason: "not_shared" };
    if (facts.ageOver18 !== "true") return { pass: false, reason: "under_18" };
    return { pass: true, validUntil: facts.validUntil, tier: facts.tier };
  }

  if (!binding) return { pass: false, reason: "no_name" };
  const sellerReason = sellerReasonFromBinding(binding);
  if (sellerReason) return { pass: false, reason: sellerReason };
  if (!binding.ok) return { pass: false, reason: "no_name" };
  const nameExpiry = new Date(binding.expiry * 1000);
  const validUntil = nameExpiry < facts.validUntil ? nameExpiry : facts.validUntil;
  return { pass: true, validUntil, tier: facts.tier };
}

type StoredCheck = {
  walletAddress: string;
  pass: boolean;
  reason: string | null;
  tier: string | null;
  validUntil: Date | null;
  checkedAt: Date;
};

/** Whether a stored row can answer now. Exported for tests. */
export function reuseStored(
  row: StoredCheck | null,
  wallet: string,
  now: Date
): IdentityCheckResult | null {
  if (!row || row.walletAddress.toLowerCase() !== wallet.toLowerCase()) return null;
  const age = now.getTime() - row.checkedAt.getTime();
  if (row.pass) {
    if (!row.validUntil || !row.tier) return null;
    if (age >= IDENTITY_PASS_CACHE_MS || row.validUntil <= now) return null;
    return { pass: true, validUntil: row.validUntil, tier: row.tier as IdentityTier };
  }
  if (age >= IDENTITY_FAIL_CACHE_MS || !row.reason || row.reason === "unavailable") return null;
  return { pass: false, reason: row.reason as IdentityFailReason };
}

async function readAuthbase(wallet: string): Promise<AuthbaseFacts | null> {
  if (!isAuthbaseConfigured()) return null;
  try {
    const status = await getAuthbaseWalletStatus(wallet);
    const raw = status.attributes?.age_over_18;
    return {
      status: status.status,
      tier: status.verification?.type ?? null,
      validUntil: status.verification ? new Date(status.verification.valid_until) : null,
      ageOver18: raw === "true" || raw === "false" ? raw : null,
    };
  } catch (err) {
    console.error("[identity] Authbase read failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function readBinding(
  revoName: string | null,
  wallet: string
): Promise<RnsBindingResult | "unavailable"> {
  if (!revoName) return { ok: false, reason: "not_found", label: null, expiry: null };
  try {
    return await checkRnsBinding(revoName, wallet);
  } catch (err) {
    console.error("[identity] RNS binding read failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return "unavailable";
  }
}

async function store(
  userId: number,
  kind: IdentityCheckKind,
  wallet: string,
  result: IdentityCheckResult
) {
  const data = {
    walletAddress: wallet.toLowerCase(),
    pass: result.pass,
    reason: result.pass ? null : result.reason,
    tier: result.pass ? result.tier : null,
    validUntil: result.pass ? result.validUntil : null,
    checkedAt: new Date(),
  };
  await prisma.identityCheck.upsert({
    where: { userId_kind: { userId, kind } },
    create: { id: uuidv7(), userId, kind, ...data },
    update: data,
  });
}

/**
 * Runs or reuses one identity check for an account. Never throws: any failure
 * to read Authbase or the chain is "unavailable", which never passes.
 */
export async function checkIdentity(
  userId: number,
  kind: IdentityCheckKind,
  opts: { fresh?: boolean } = {}
): Promise<IdentityCheckResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { revo_name: true, wallet: { select: { address: true } } },
    });
    const wallet = user?.wallet?.address ?? null;
    if (!user || !wallet || !isAddress(wallet)) return { pass: false, reason: "no_wallet" };

    const now = new Date();
    if (kind === "age_over_18" && (await hasOpenUnder18Case(userId))) {
      // Spec 4.5: while a case is open, 18+ stays closed whatever Authbase says
      return { pass: false, reason: "under_18" };
    }

    if (!opts.fresh) {
      const row = await prisma.identityCheck.findUnique({
        where: { userId_kind: { userId, kind } },
        select: {
          walletAddress: true,
          pass: true,
          reason: true,
          tier: true,
          validUntil: true,
          checkedAt: true,
        },
      });
      const reused = reuseStored(row, wallet, now);
      if (reused) return reused;
    }

    const facts = await readAuthbase(wallet);
    if (!facts) return { pass: false, reason: "unavailable" };

    let binding: RnsBindingResult | null = null;
    if (
      kind === "seller" &&
      (facts.status === "VERIFIED" || facts.status === "VERIFIED_WITH_BADGE")
    ) {
      const read = await readBinding(user.revo_name, wallet);
      if (read === "unavailable") return { pass: false, reason: "unavailable" };
      binding = read;
    }

    const result = evaluateIdentity(kind, facts, binding);
    await store(userId, kind, wallet, result);
    if (!result.pass && result.reason === "under_18") await recordUnder18Result(userId);
    return result;
  } catch (err) {
    console.error("[identity] check failed", {
      userId,
      kind,
      message: err instanceof Error ? err.message : String(err),
    });
    return { pass: false, reason: "unavailable" };
  }
}

/** The account's own results for the Over 18 sheet and the Get paid card. */
export async function myIdentityChecks(userId: number) {
  const [ageOver18, seller] = await Promise.all([
    checkIdentity(userId, "age_over_18"),
    checkIdentity(userId, "seller"),
  ]);
  return { ageOver18, seller };
}

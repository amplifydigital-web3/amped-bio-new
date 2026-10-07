import { z } from "zod";
import { getAddress, isAddress, type Address } from "viem";
import {
  formatRnsName,
  isRnsNameActive,
  parseRnsInput,
  rnsExpiryFromGraceEnd,
  RNS_CHAIN,
} from "@repo/web3";
import { env } from "../env";
import { cache } from "../utils/cache";
import { getAuthbaseWalletStatus, isAuthbaseConfigured } from "./authbase";
import { checkRnsBinding, checkRnsBindingCached, type RnsBindingResult } from "./rns";
import { readPrimaryName } from "./rnsSummary";

/**
 * Screen Review 108 and 109: what a creator page shows about its RNS name and
 * identity check. One server rule feeds the public page (getHandle), the
 * editor preview and the Page RNS section, so the preview equals the page.
 */

// ── Display settings (108 I04) ─────────────────────────────────

export const rnsDisplaySchema = z.object({
  showName: z.boolean(),
  showBadge: z.boolean(),
  details: z.object({
    name: z.boolean(),
    wallet: z.boolean(),
    check: z.boolean(),
  }),
});

export type RnsDisplay = z.infer<typeof rnsDisplaySchema>;

export const RNS_DISPLAY_DEFAULTS: RnsDisplay = {
  showName: true,
  showBadge: true,
  details: { name: true, wallet: true, check: true },
};

/** Reads the stored JSON. Missing or malformed values fall back to the defaults. */
export function parseRnsDisplay(value: unknown): RnsDisplay {
  if (value === null || value === undefined) return RNS_DISPLAY_DEFAULTS;
  const parsed = rnsDisplaySchema.safeParse(value);
  return parsed.success ? parsed.data : RNS_DISPLAY_DEFAULTS;
}

// ── Authbase summary (attributes never leave this module) ──────

export type RnsCheckTier = "standard" | "enhanced";

export type RnsVerification =
  | { state: "verified"; verifiedAt: string; validUntil: string; tier: RnsCheckTier }
  | { state: "not_verified" | "off" | "unavailable" };

const VERIFICATION_TTL_SECONDS = 300;

/**
 * Authbase status for a wallet as {state, dates, tier}. Successful reads are
 * cached for 5 minutes per wallet (109 I01). Failures are not cached, and
 * return unavailable so the public page falls back to the name chip.
 */
export async function getRnsVerification(wallet: string): Promise<RnsVerification> {
  if (!isAuthbaseConfigured()) return { state: "off" };
  const key = `rns_verification:${wallet.toLowerCase()}`;
  const hit = await cache.get<RnsVerification>(key);
  if (hit) return hit;
  try {
    const status = await getAuthbaseWalletStatus(wallet);
    const alreadyExpired =
      status.verified &&
      status.verification &&
      status.verification.valid_until &&
      Date.now() > new Date(status.verification.valid_until).getTime();
    const result: RnsVerification =
      status.verified && status.verification && !alreadyExpired
        ? {
            state: "verified",
            verifiedAt: status.verification.verified_at,
            validUntil: status.verification.valid_until,
            tier: status.verification.type === "ENHANCED" ? "enhanced" : "standard",
          }
        : { state: "not_verified" };
    // Cache entries expire at most at validUntil so stale verified state is never shown
    const ttl = result.state === "verified"
      ? Math.min(VERIFICATION_TTL_SECONDS, Math.max(1, Math.floor((new Date(result.validUntil).getTime() - Date.now()) / 1000)))
      : VERIFICATION_TTL_SECONDS;
    await cache.set(key, result, ttl);
    return result;
  } catch (error) {
    console.warn("[rnsIdentity] Authbase read failed, showing the name only:", error);
    return { state: "unavailable" };
  }
}

// ── Name state for the owner (108 I02, I07, I15) ───────────────

/**
 * linked: the binding holds now. not_linked: owned elsewhere or the resolver
 * points to another wallet. expired: the registration expired. unavailable:
 * the chain read failed. none: no name stored. no_wallet: no account wallet.
 */
export type RnsNameState =
  | "linked"
  | "not_linked"
  | "expired"
  | "unavailable"
  | "none"
  | "no_wallet";

export function nameStateFrom(result: RnsBindingResult): RnsNameState {
  if (result.ok) return "linked";
  if (result.reason === "no_wallet") return "no_wallet";
  if (result.reason === "expired") return "expired";
  return "not_linked";
}

// ── Public identity (109 I01) ──────────────────────────────────

export type PublicRnsIdentity = {
  /** verified: name bound, Authbase verified, badge on. name: name bound, shown. */
  chip: "verified" | "name";
  /** The RNS name (label plus suffix). Always present for chip "name"; for "verified" only when details.name is on. */
  name?: string;
  /** The bare label, for Send and the RNS profile link. Present whenever name is. */
  label?: string;
  /** The page wallet, only when details.wallet is on */
  wallet?: string;
  /** The identity check, only when verified and details.check is on */
  check?: { verifiedAt: string; validUntil: string; tier: RnsCheckTier };
} | null;

export type RnsIdentityInput = {
  storedName: string | null;
  wallet: string | null;
  display: RnsDisplay;
};

export type RnsIdentityResult = {
  identity: PublicRnsIdentity;
  label: string | null;
  name: string | null;
  nameState: RnsNameState;
  expiry: number | null;
  verification: RnsVerification;
};

/**
 * Applies the owner's limits on the server, so a hidden field never reaches a
 * visitor. Fails closed: any doubt about the binding shows no chip, any doubt
 * about the check shows the name chip.
 */
export async function computeRnsIdentity(
  { storedName, wallet, display }: RnsIdentityInput,
  options: { fresh?: boolean } = {}
): Promise<RnsIdentityResult> {
  const label = storedName ? parseRnsInput(storedName, RNS_CHAIN.id) || null : null;
  const name = label ? formatRnsName(label, RNS_CHAIN.id) : null;
  const walletAddress = wallet && isAddress(wallet, { strict: false }) ? getAddress(wallet) : null;
  const base = { label, name, expiry: null as number | null };

  // The check is read for the owner whatever the name does (108 I08)
  const verificationPromise: Promise<RnsVerification> =
    walletAddress && env.RNS_PUBLIC_IDENTITY
      ? getRnsVerification(walletAddress)
      : Promise.resolve({ state: walletAddress ? "off" : "not_verified" });

  if (!walletAddress) {
    return {
      ...base,
      identity: null,
      nameState: label ? "no_wallet" : "none",
      verification: await verificationPromise,
    };
  }
  if (!label) {
    return { ...base, identity: null, nameState: "none", verification: await verificationPromise };
  }

  let binding: RnsBindingResult | null = null;
  try {
    binding = options.fresh
      ? await checkRnsBinding(label, walletAddress)
      : await checkRnsBindingCached(label, walletAddress);
  } catch (error) {
    console.warn("[rnsIdentity] RNS binding read failed, hiding the name:", error);
  }
  const verification = await verificationPromise;
  const nameState: RnsNameState = binding ? nameStateFrom(binding) : "unavailable";
  const expiry = binding?.expiry ?? null;

  if (!binding?.ok || !display.showName) {
    return { ...base, expiry, identity: null, nameState, verification };
  }

  const verified = verification.state === "verified" && display.showBadge;
  const identity: NonNullable<PublicRnsIdentity> = { chip: verified ? "verified" : "name" };
  if (!verified || display.details.name) {
    identity.name = name!;
    identity.label = label;
  }
  if (display.details.wallet) identity.wallet = walletAddress;
  if (verified && display.details.check && verification.state === "verified") {
    identity.check = {
      verifiedAt: verification.verifiedAt,
      validUntil: verification.validUntil,
      tier: verification.tier,
    };
  }
  return { ...base, expiry, identity, nameState, verification };
}

// ── The account wallet's names (108 I03) ───────────────────────

export type MyRnsName = {
  label: string;
  name: string;
  /** Registration expiry in seconds */
  expiry: number;
  /** linked: selectable. not_linked: points elsewhere. expired. unavailable: the check failed. */
  state: "linked" | "not_linked" | "expired" | "unavailable";
  isPrimary: boolean;
};

const subgraphNamesSchema = z.object({
  data: z.object({
    revoNames: z.array(
      z.object({
        labelName: z.string().nullable().optional(),
        expiryDateWithGrace: z.string(),
      })
    ),
  }),
});

const MAX_NAMES = 100;

/** Every name the wallet owns in the subgraph, checked against the binding rule. Throws on a failed read. */
export async function listRnsNamesForWallet(wallet: Address): Promise<MyRnsName[]> {
  if (!env.SUBGRAPH_URL) throw new Error("SUBGRAPH_URL is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let rows: z.infer<typeof subgraphNamesSchema>["data"]["revoNames"];
  try {
    const res = await fetch(env.SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        query: `query ($o: String!, $n: Int!) { revoNames(first: $n, where: { owner: $o, labelName_not: null }) { labelName expiryDateWithGrace } }`,
        variables: { o: wallet.toLowerCase(), n: MAX_NAMES },
      }),
    });
    if (!res.ok) throw new Error(`Subgraph responded with ${res.status}`);
    const parsed = subgraphNamesSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("Subgraph returned an unexpected shape");
    rows = parsed.data.data.revoNames;
  } finally {
    clearTimeout(timeout);
  }

  const primary = await readPrimaryName(wallet);
  const primaryLabel = primary ? parseRnsInput(primary, RNS_CHAIN.id) : null;
  const labels = [...new Set(rows.map(row => row.labelName ?? "").filter(Boolean))];
  const expiryByLabel = new Map(
    rows.map(row => [row.labelName ?? "", rnsExpiryFromGraceEnd(row.expiryDateWithGrace)])
  );

  const names = await Promise.all(
    labels.map(async (label): Promise<MyRnsName> => {
      const fallbackExpiry = expiryByLabel.get(label) ?? 0;
      let state: MyRnsName["state"];
      let expiry = fallbackExpiry;
      if (!isRnsNameActive(fallbackExpiry)) {
        state = "expired";
      } else {
        try {
          const binding = await checkRnsBindingCached(label, wallet);
          expiry = binding.expiry ?? fallbackExpiry;
          state = binding.ok ? "linked" : binding.reason === "expired" ? "expired" : "not_linked";
        } catch {
          state = "unavailable";
        }
      }
      return {
        label,
        name: formatRnsName(label, RNS_CHAIN.id),
        expiry,
        state,
        isPrimary: label === primaryLabel,
      };
    })
  );

  // Linked first, then by name
  const rank = { linked: 0, unavailable: 1, not_linked: 2, expired: 3 } as const;
  return names.sort((a, b) => rank[a.state] - rank[b.state] || a.label.localeCompare(b.label));
}

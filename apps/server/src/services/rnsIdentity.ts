import { z } from "zod";
import { getAddress, isAddress, type Address } from "viem";
import {
  AUTHBASE_ATTRIBUTE_KEYS,
  RNSID_ATTRIBUTE_SWITCH,
  rnsIdConfigSchema,
  type AuthbaseAttributeKey,
} from "@repo/constants";
import {
  formatRnsName,
  isRnsNameActive,
  parseRnsInput,
  rnsExpiryFromGraceEnd,
  RNS_CHAIN,
} from "@repo/web3";
import { env } from "../env";
import { cache } from "../utils/cache";
import { getAuthbaseWalletStatus, isAuthbaseConfigured, publicSharedAttributes } from "./authbase";
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

/**
 * The on chain verification badge Authbase mints for a VERIFIED_WITH_BADGE
 * status. The token id stays on the server: the page shows the tier and the
 * mint date only.
 */
export type RnsBadge = { tier: RnsCheckTier; mintedAt: string };

const toTier = (value: string): RnsCheckTier => (value === "ENHANCED" ? "enhanced" : "standard");

export type RnsVerification =
  | {
      state: "verified";
      verifiedAt: string;
      validUntil: string;
      tier: RnsCheckTier;
      /** Present only for a VERIFIED_WITH_BADGE status */
      badge?: RnsBadge;
      /**
       * The attributes the owner shared through Authbase, only under the 079
       * D2 rule (RNS_PUBLIC_ATTRIBUTES). Leave this module only through
       * computeRnsIdentity, each one when the owner's RNS ID block asks for it (112 D1).
       */
      attributes?: SharedAttributes;
    }
  /**
   * Authbase still reports a VERIFIED* status but valid_until has passed by
   * this server's clock. Authbase flips it to NOT_VERIFIED at the source, with
   * no dates, so this is only seen in that window. The owner sees it in the
   * editor; a visitor sees the same as not_verified.
   */
  | { state: "expired"; validUntil: string }
  | { state: "not_verified" | "off" | "unavailable" };

export type SharedAttributes = Partial<Record<AuthbaseAttributeKey, string>>;

const VERIFICATION_TTL_SECONDS = 300;

/**
 * Authbase status for a wallet as {state, dates, tier}. Successful reads are
 * cached for 5 minutes per wallet (109 I01). Failures are not cached, and
 * return unavailable so the public page falls back to the name chip.
 * `fresh` skips the read (and refills the entry), so the owner's own view shows
 * a consent change on Authbase at once instead of up to 5 minutes later.
 */
export async function getRnsVerification(wallet: string, fresh = false): Promise<RnsVerification> {
  if (!isAuthbaseConfigured()) return { state: "off" };
  const key = `rns_verification:${wallet.toLowerCase()}`;
  const hit = fresh ? null : await cache.get<RnsVerification>(key);
  if (hit) return hit;
  try {
    const status = await getAuthbaseWalletStatus(wallet);
    const alreadyExpired =
      status.verified &&
      status.verification &&
      status.verification.valid_until &&
      Date.now() > new Date(status.verification.valid_until).getTime();
    const attributes = env.RNS_PUBLIC_ATTRIBUTES ? publicSharedAttributes(status.attributes) : {};
    const result: RnsVerification =
      status.verified && status.verification && !alreadyExpired
        ? {
            state: "verified",
            verifiedAt: status.verification.verified_at,
            validUntil: status.verification.valid_until,
            tier: toTier(status.verification.type),
            ...(status.badge
              ? { badge: { tier: toTier(status.badge.tier), mintedAt: status.badge.minted_at } }
              : {}),
            ...(Object.keys(attributes).length ? { attributes } : {}),
          }
        : status.verified && status.verification && alreadyExpired
          ? { state: "expired", validUntil: status.verification.valid_until }
          : { state: "not_verified" };
    // Cache entries expire at most at validUntil so stale verified state is never shown
    const ttl =
      result.state === "verified"
        ? Math.min(
            VERIFICATION_TTL_SECONDS,
            Math.max(1, Math.floor((new Date(result.validUntil).getTime() - Date.now()) / 1000))
          )
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
  /**
   * verified: Authbase verified and the owner shows the Verified badge.
   * name: a linked name, no Verified claim. none: no linked name and no
   * Verified claim, only shared attributes (RNS ID block, 112 D8 and D9).
   */
  chip: "verified" | "name" | "none";
  /**
   * The RNS name binding holds (bound, active, resolves to the page wallet).
   * False only on the RNS ID block's identity without a linked name (112 D9).
   * The header chip and every "name points here" line need it.
   */
  linked: boolean;
  /**
   * 112 D8: a current Authbase check, with the Verified badge switched off by
   * the owner. The page drops the Verified claim and the Not verified caution.
   */
  checkHidden?: true;
  /** The on chain badge, only with chip "verified" (Authbase VERIFIED_WITH_BADGE) */
  badge?: RnsBadge;
  /** The RNS name (label plus suffix). Always present for chip "name"; for "verified" only when details.name is on. */
  name?: string;
  /** The bare label, for Send and the RNS profile link. Present whenever name is. */
  label?: string;
  /** The page wallet, only when details.wallet is on */
  wallet?: string;
  /** The identity check, only when verified and details.check is on */
  check?: { verifiedAt: string; validUntil: string; tier: RnsCheckTier };
  /**
   * Attributes the owner shared through Authbase (112 D1). Only when verified,
   * RNS_PUBLIC_ATTRIBUTES is on, and each key's switch is on in the owner's
   * RNS ID block. Independent of the Verified badge (112 D8).
   */
  attributes?: SharedAttributes;
} | null;

export type RnsIdentityInput = {
  storedName: string | null;
  wallet: string | null;
  display: RnsDisplay;
  /** The owner's RNS ID block switches, from rnsIdBlockOptions (112) */
  block?: RnsIdBlockOptions;
};

export type RnsIdBlockOptions = { attributes: AuthbaseAttributeKey[]; visible: boolean };

/**
 * The RNS ID block's identity switches, from the page's block rows. Only a
 * visible rnsid block counts; a hidden one asks for nothing. One block per
 * page (SINGLETON_BLOCK_TYPES), so the first match is the block. `visible`
 * also gates the public join month (`since`), which only a block asks for.
 */
export function rnsIdBlockOptions(
  blocks: readonly { type: string; config: unknown }[]
): RnsIdBlockOptions {
  const block = blocks.find(row => row.type === "rnsid");
  if (!block) return { attributes: [], visible: false };
  const parsed = rnsIdConfigSchema.safeParse(block.config);
  if (!parsed.success || parsed.data.hidden) return { attributes: [], visible: false };
  const { show } = parsed.data;
  return {
    attributes: AUTHBASE_ATTRIBUTE_KEYS.filter(key => show[RNSID_ATTRIBUTE_SWITCH[key]]),
    visible: true,
  };
}

/** The shared attributes the owner's block switches allow, in catalog order. */
export function pickShownAttributes(
  attributes: SharedAttributes | undefined,
  keys: readonly AuthbaseAttributeKey[]
): SharedAttributes {
  const shown: SharedAttributes = {};
  for (const key of keys) {
    const value = attributes?.[key];
    if (value) shown[key] = value;
  }
  return shown;
}

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
 * visitor. Fails closed: any doubt about the binding shows no name, any doubt
 * about the check shows no Verified claim. Without a linked name only a
 * visible RNS ID block on a current check gets an identity (112 D9), and it
 * never carries a name or a "points here" claim (linked false).
 */
export async function computeRnsIdentity(
  { storedName, wallet, display, block }: RnsIdentityInput,
  options: { fresh?: boolean } = {}
): Promise<RnsIdentityResult> {
  const label = storedName ? parseRnsInput(storedName, RNS_CHAIN.id) || null : null;
  const name = label ? formatRnsName(label, RNS_CHAIN.id) : null;
  const walletAddress = wallet && isAddress(wallet, { strict: false }) ? getAddress(wallet) : null;
  const base = { label, name, expiry: null as number | null };

  // The check is read for the owner whatever the name does (108 I08)
  const verificationPromise: Promise<RnsVerification> =
    walletAddress && env.RNS_PUBLIC_IDENTITY
      ? getRnsVerification(walletAddress, options.fresh)
      : Promise.resolve({ state: walletAddress ? "off" : "not_verified" });

  if (!walletAddress) {
    return {
      ...base,
      identity: null,
      nameState: label ? "no_wallet" : "none",
      verification: await verificationPromise,
    };
  }
  let binding: RnsBindingResult | null = null;
  if (label) {
    try {
      binding = options.fresh
        ? await checkRnsBinding(label, walletAddress)
        : await checkRnsBindingCached(label, walletAddress);
    } catch (error) {
      console.warn("[rnsIdentity] RNS binding read failed, hiding the name:", error);
    }
  }
  const verification = await verificationPromise;
  const nameState: RnsNameState = !label
    ? "none"
    : binding
      ? nameStateFrom(binding)
      : "unavailable";
  const expiry = binding?.expiry ?? null;
  const linked = !!binding?.ok;
  const current = verification.state === "verified" ? verification : null;

  // Show on my page off hides the whole identity. Without a linked name only
  // the RNS ID block can show the check, and only a current one (112 D9).
  if (!display.showName || (!linked && !(block?.visible && current))) {
    return { ...base, expiry, identity: null, nameState, verification };
  }

  const verified = !!current && display.showBadge;
  const identity: NonNullable<PublicRnsIdentity> = {
    chip: verified ? "verified" : linked ? "name" : "none",
    linked,
  };
  if (linked && (!verified || display.details.name)) {
    identity.name = name!;
    identity.label = label!;
  }
  if (display.details.wallet) identity.wallet = walletAddress;
  if (verified && current) {
    if (display.details.check) {
      identity.check = {
        verifiedAt: current.verifiedAt,
        validUntil: current.validUntil,
        tier: current.tier,
      };
    }
    if (current.badge) identity.badge = current.badge;
  }
  // 112 D8: the owner hid the badge on a current check. The page drops the
  // Verified claim and must not say Not verified either.
  if (current && !display.showBadge) identity.checkHidden = true;
  // 112 D1: shared attributes follow the owner's block switches, not the badge.
  // Hiding the Verified chip must not hide them: only the public attributes flag
  // and a current verification gate them. The flag is re-checked at read time so
  // a cached verification cannot release them after the flag turns off (cache
  // entries can be up to 5 min old).
  if (env.RNS_PUBLIC_ATTRIBUTES && current) {
    const shown = pickShownAttributes(current.attributes, block?.attributes ?? []);
    if (Object.keys(shown).length) identity.attributes = shown;
  }
  // 112 D9: with no linked name and no Verified claim, the block has nothing
  // to show unless the owner shared attributes
  if (identity.chip === "none" && !identity.attributes) {
    return { ...base, expiry, identity: null, nameState, verification };
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

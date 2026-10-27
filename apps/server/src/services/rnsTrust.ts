import { getAddress, isAddress, type Address } from "viem";
import {
  checkRnsLabel,
  formatRnsName,
  isRnsNameActive,
  parseRnsInput,
  RNS_CHAIN,
} from "@repo/web3";
import { prisma } from "@repo/database";
import { cache } from "../utils/cache";
import { getFileUrl } from "../utils/fileUrlResolver";
import { getAuthbaseWalletStatus, isAuthbaseConfigured } from "./authbase";
import { readRnsNameOnChain } from "./rns";
import { readPrimaryName } from "./rnsSummary";

/**
 * Screen Review 110 I03, I04: who a sender is paying. One server read for an
 * RNS name or a wallet address. It never returns Authbase attributes; the
 * verification is the status of the resolved wallet only.
 */
export type RecipientVerification = "verified" | "not_verified" | "unavailable" | "off";

export type RecipientProfile = {
  handle: string;
  displayName: string | null;
  avatar: string | null;
} | null;

export type RecipientTrust =
  | { status: "invalid" | "not_found"; label: string | null }
  | { status: "expired"; label: string; name: string; expiresAt: number }
  | { status: "no_address"; label: string; name: string; expiresAt: number }
  | {
      status: "ok";
      /** The RNS label typed, null for a plain address */
      label: string | null;
      name: string | null;
      resolvedAddress: Address;
      /** BaseRegistrar owner of the name; null for a plain address */
      owner: Address | null;
      expiresAt: number | null;
      /** The name points to its owner's wallet (always true for a plain address) */
      pointsToOwner: boolean;
      /** Forward checked primary RNS name of the address */
      primaryName: string | null;
      verification: RecipientVerification;
      /** Verified owner: active name, owner equals addr, Authbase verified (110 I03) */
      verifiedOwner: boolean;
      /** The Amped.Bio account whose wallet is the resolved address */
      profile: RecipientProfile;
    };

const TRUST_TTL_SECONDS = 30;
const ZERO = "0x0000000000000000000000000000000000000000";

const sameAddress = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

async function readVerification(address: Address): Promise<RecipientVerification> {
  if (!isAuthbaseConfigured()) return "off";
  try {
    // Only the boolean leaves this function. Attributes never reach the caller.
    const status = await getAuthbaseWalletStatus(address);
    return status.verified ? "verified" : "not_verified";
  } catch {
    return "unavailable";
  }
}

async function readProfile(address: Address): Promise<RecipientProfile> {
  const user = await prisma.user.findFirst({
    where: { wallet: { address } },
    select: { handle: true, name: true, image: true, image_file_id: true },
  });
  if (!user?.handle) return null;
  const avatar = await getFileUrl({
    legacyImageField: user.image,
    imageFileId: user.image_file_id,
  }).catch(() => null);
  return { handle: user.handle, displayName: user.name || null, avatar };
}

async function trustForAddress(
  address: Address,
  extra: {
    label: string | null;
    name: string | null;
    owner: Address | null;
    expiresAt: number | null;
  }
): Promise<RecipientTrust> {
  const [verification, profile, primaryName] = await Promise.all([
    readVerification(address),
    readProfile(address).catch(() => null),
    readPrimaryName(address),
  ]);
  const pointsToOwner = extra.owner ? sameAddress(extra.owner, address) : true;
  const active = extra.expiresAt === null || isRnsNameActive(extra.expiresAt);
  return {
    status: "ok",
    label: extra.label,
    name: extra.name,
    resolvedAddress: address,
    owner: extra.owner,
    expiresAt: extra.expiresAt,
    pointsToOwner,
    primaryName,
    verification,
    verifiedOwner: verification === "verified" && pointsToOwner && active,
    profile,
  };
}

export async function getRecipientTrust(query: string): Promise<RecipientTrust> {
  const input = query.trim();
  if (isAddress(input, { strict: false })) {
    const address = getAddress(input);
    if (address === ZERO) return { status: "invalid", label: null };
    const key = `rns_trust:${RNS_CHAIN.id}:${address.toLowerCase()}`;
    const hit = await cache.get<RecipientTrust>(key);
    if (hit) return hit;
    const trust = await trustForAddress(address, {
      label: null,
      name: null,
      owner: null,
      expiresAt: null,
    });
    await cache.set(key, trust, TRUST_TTL_SECONDS);
    return trust;
  }

  const label = parseRnsInput(input.replace(/^@/, ""), RNS_CHAIN.id);
  if (!label || checkRnsLabel(label)) return { status: "invalid", label: null };
  const key = `rns_trust:${RNS_CHAIN.id}:${label}`;
  const hit = await cache.get<RecipientTrust>(key);
  if (hit) return hit;

  const record = await readRnsNameOnChain(label);
  const name = formatRnsName(label, RNS_CHAIN.id);
  let trust: RecipientTrust;
  if (!record.expiry) trust = { status: "not_found", label };
  else if (!isRnsNameActive(record.expiry)) {
    trust = { status: "expired", label, name, expiresAt: record.expiry };
  } else if (!record.addr) {
    trust = { status: "no_address", label, name, expiresAt: record.expiry };
  } else {
    trust = await trustForAddress(record.addr, {
      label,
      name,
      owner: record.owner,
      expiresAt: record.expiry,
    });
  }
  await cache.set(key, trust, TRUST_TTL_SECONDS);
  return trust;
}

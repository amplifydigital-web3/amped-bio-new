import { createPublicClient, getAddress, type Address, type PublicClient } from "viem";
import {
  getRpcTransport,
  isRnsNameActive,
  parseRnsInput,
  RESOLVER_ABI,
  REVERSE_REGISTRAR_ABI,
  RNS_CHAIN,
  rnsExpiryFromGraceEnd,
} from "@repo/web3";
import { prisma } from "@repo/database";
import { env } from "../env";
import { cache } from "../utils/cache";
import { getFileUrl } from "../utils/fileUrlResolver";
import { getAuthbaseWalletStatus, isAuthbaseConfigured } from "./authbase";
import { checkRnsBindingCached, readRnsNameOnChain } from "./rns";

/**
 * Screen Review 100 I08: who owns an address, without Authbase attributes.
 * Rows 101 (address search result), 110 (send recipient) and 111 (address
 * view) read this one summary.
 */
export type RnsAddressSummary = {
  address: Address;
  /** Active RNS names (registration not expired). null when the index did not answer. */
  activeNames: number | null;
  /** Forward checked primary RNS name (reverse record that the address still owns). */
  primaryName: string | null;
  /** Authbase identity check passed. null when Authbase is off or did not answer. */
  verified: boolean | null;
  /** The Amped.Bio page bound to this wallet, only when its RNS name passes the binding rule. */
  person: { handle: string; name: string; image: string | null } | null;
};

const SUMMARY_TTL_SECONDS = 60;

let client: PublicClient | null = null;
function rnsPublicClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      chain: RNS_CHAIN,
      transport: getRpcTransport(RNS_CHAIN, { timeout: 5_000 }),
    }) as PublicClient;
  }
  return client;
}

async function countActiveNames(owner: Address): Promise<number | null> {
  if (!env.SUBGRAPH_URL) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(env.SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        query: `query ($o: String!) { revoNames(first: 1000, where: { owner: $o, name_not: null }) { expiryDateWithGrace } }`,
        variables: { o: owner.toLowerCase() },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { revoNames?: { expiryDateWithGrace: string }[] };
    };
    const names = json.data?.revoNames;
    if (!Array.isArray(names)) return null;
    return names.filter(n => isRnsNameActive(rnsExpiryFromGraceEnd(n.expiryDateWithGrace))).length;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readPrimaryName(owner: Address): Promise<string | null> {
  const client = rnsPublicClient();
  const { REVERSE_REGISTRAR, L2_RESOLVER } = RNS_CHAIN.contracts;
  try {
    const node = (await client.readContract({
      address: REVERSE_REGISTRAR.address,
      abi: REVERSE_REGISTRAR_ABI,
      functionName: "node",
      args: [owner],
    })) as `0x${string}`;
    const name = (await client.readContract({
      address: L2_RESOLVER.address,
      abi: RESOLVER_ABI,
      functionName: "name",
      args: [node],
    })) as string;
    const label = name ? parseRnsInput(name, RNS_CHAIN.id) : "";
    if (!label) return null;
    // A reverse record is self asserted; trust it only while the address owns the name
    const record = await readRnsNameOnChain(label);
    const owned =
      isRnsNameActive(record.expiry) && record.owner?.toLowerCase() === owner.toLowerCase();
    return owned ? name : null;
  } catch {
    return null;
  }
}

async function readVerified(owner: Address): Promise<boolean | null> {
  if (!isAuthbaseConfigured()) return null;
  try {
    // Only the boolean leaves this function. Attributes never reach the caller.
    const status = await getAuthbaseWalletStatus(owner);
    return status.verified;
  } catch {
    return null;
  }
}

async function readBoundPerson(owner: Address): Promise<RnsAddressSummary["person"]> {
  const user = await prisma.user.findFirst({
    where: { wallet: { address: owner } },
    select: {
      handle: true,
      name: true,
      image: true,
      image_file_id: true,
      revo_name: true,
      wallet: { select: { address: true } },
    },
  });
  if (!user?.handle || !user.revo_name || !user.wallet) return null;
  try {
    const binding = await checkRnsBindingCached(user.revo_name, user.wallet.address);
    if (!binding.ok) return null;
  } catch {
    return null;
  }
  const image = await getFileUrl({
    legacyImageField: user.image,
    imageFileId: user.image_file_id,
  }).catch(() => null);
  return { handle: user.handle, name: user.name, image };
}

export async function getRnsAddressSummary(address: string): Promise<RnsAddressSummary> {
  const owner = getAddress(address);
  const key = `rns_address_summary:${RNS_CHAIN.id}:${owner.toLowerCase()}`;
  const hit = await cache.get<RnsAddressSummary>(key);
  if (hit) return hit;

  const [activeNames, primaryName, verified, person] = await Promise.all([
    countActiveNames(owner),
    readPrimaryName(owner),
    readVerified(owner),
    readBoundPerson(owner).catch(() => null),
  ]);
  const summary: RnsAddressSummary = { address: owner, activeNames, primaryName, verified, person };
  await cache.set(key, summary, SUMMARY_TTL_SECONDS);
  return summary;
}

import {
  Chain,
  createPublicClient,
  http,
  keccak256,
  parseAbiItem,
  toBytes,
  zeroAddress,
} from "viem";
import { BASE_REGISTRAR_ABI, getChainConfig } from "@ampedbio/web3";

import { NameDetail } from "@/types/rns/name";
import { RegistrationData } from "@/types/rns/registration";
import { SubgraphResult } from "@/types/subgraph";
import { domainName } from "@/utils/rns";

import type { DateDetailsResult, OwnershipDetailsResult } from "./queries";

/**
 * On-chain fallback for single-name reads when the subgraph is unreachable or
 * lagging behind chain head.
 *
 * Owner (`ownerOf`) and expiry (`nameExpires`) come straight off the
 * BaseRegistrar. The registration date is not stored on the contract, so it is
 * reconstructed from the block timestamp of the name's `NameRegistered` event
 * (best-effort — empty when logs are unavailable). The registration tx hash and
 * the resolver's declared text-record keys remain subgraph-only and are left
 * empty; callers tolerate that (e.g. useNameDetails always fetches the known
 * profile keys on-chain regardless of `resolver.texts`).
 *
 * Unlike the single-network revolution-names UI, amped-bio is multi-network, so
 * the chain config is threaded in from the caller (getChainConfig) rather than
 * read from a module-level constant.
 */

/** The resolved, non-null shape returned by getChainConfig. */
export type ChainConfig = NonNullable<ReturnType<typeof getChainConfig>>;

const FALLBACK_ERROR = "Subgraph unavailable and on-chain fallback failed";

// A name can be registered via either entry point on the BaseRegistrar, so both
// registration events are considered when reconstructing the registration date.
const NAME_REGISTERED_EVENTS = [
  parseAbiItem("event NameRegistered(uint256 indexed id, address indexed owner, uint256 expires)"),
  parseAbiItem(
    "event NameRegisteredWithRecord(uint256 indexed id, address indexed owner, uint256 expires, address resolver, uint64 ttl)"
  ),
] as const;

type OnchainNameCore = {
  owner: `0x${string}`;
  /** Registration expiry (unix seconds) as reported by nameExpires. */
  expiry: string;
};

// One public client per chain, reused across reads.
const clientCache = new Map<number, ReturnType<typeof createPublicClient>>();

function clientForChain(chain: ChainConfig) {
  const cached = clientCache.get(chain.id);
  if (cached) return cached;

  const client = createPublicClient({
    chain: chain as unknown as Chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });
  clientCache.set(chain.id, client);
  return client;
}

/** BaseRegistrar address for the chain, or undefined when not deployed. */
function baseRegistrarOf(chain: ChainConfig): `0x${string}` | undefined {
  const address = chain.contracts.BASE_REGISTRAR.address;
  return address && address !== zeroAddress ? (address as `0x${string}`) : undefined;
}

// Names read on-chain are assumed to use the default resolver; a custom resolver
// isn't discoverable here without an extra registry read (callers tolerate this).
const resolverOf = (chain: ChainConfig): `0x${string}` =>
  chain.contracts.L2_RESOLVER.address as `0x${string}`;

const labelHashFromName = (name: string) => keccak256(toBytes(name));

// Registration grace period (seconds) baked into the BaseRegistrar. `ownerOf`
// reverts at raw expiry, but the name stays renewable — and the subgraph keeps
// reporting it live via `expiryDateWithGrace` — until expiry + GRACE_PERIOD.
// Consumers compare `expiryDateWithGrace` against the wall clock, so the
// fallback must add the same offset the subgraph does; exposing the raw
// registration expiry here would flag a grace-period name as expired a full
// grace period early. Mirrors GRACE_PERIOD in the RNS L2 contracts
// (util/Constants.sol: `1 days`). `nameExpires` itself stays on
// registration.expiryDate untouched.
const GRACE_PERIOD_SECONDS = 86_400n;

/** Registration expiry (from nameExpires) plus the on-chain grace period. */
const expiryWithGrace = (expiry: string): string =>
  (BigInt(expiry) + GRACE_PERIOD_SECONDS).toString();

/**
 * Reads owner + expiry for a name token directly from the BaseRegistrar.
 * Returns null when the token is unregistered/expired or the RPC read fails.
 */
async function readOnchainNameCore(
  chain: ChainConfig,
  tokenId: bigint
): Promise<OnchainNameCore | null> {
  const baseRegistrar = baseRegistrarOf(chain);
  if (!baseRegistrar) return null;

  try {
    const client = clientForChain(chain);
    const [owner, expiry] = await Promise.all([
      client.readContract({
        address: baseRegistrar,
        abi: BASE_REGISTRAR_ABI,
        functionName: "ownerOf",
        args: [tokenId],
      }),
      client.readContract({
        address: baseRegistrar,
        abi: BASE_REGISTRAR_ABI,
        functionName: "nameExpires",
        args: [tokenId],
      }),
    ]);

    return {
      owner: owner as `0x${string}`,
      expiry: (expiry as bigint).toString(),
    };
  } catch {
    return null;
  }
}

/**
 * Reconstructs the registration date (unix seconds, as a string) from the block
 * timestamp of the name's most recent NameRegistered event. The latest event
 * wins so a name re-registered after expiry reports its current registration.
 * Returns '' when no event is found or the RPC rejects the log query.
 */
async function readRegistrationTimestamp(chain: ChainConfig, tokenId: bigint): Promise<string> {
  const baseRegistrar = baseRegistrarOf(chain);
  if (!baseRegistrar) return "";

  try {
    const client = clientForChain(chain);
    const logsPerEvent = await Promise.all(
      NAME_REGISTERED_EVENTS.map(event =>
        client.getLogs({
          address: baseRegistrar,
          event,
          args: { id: tokenId },
          fromBlock: "earliest",
          toBlock: "latest",
        })
      )
    );

    const mined = logsPerEvent
      .flat()
      .filter((log): log is typeof log & { blockNumber: bigint } => log.blockNumber !== null);
    if (!mined.length) return "";

    const latest = mined.reduce((a, b) => (b.blockNumber > a.blockNumber ? b : a));
    const block = await client.getBlock({ blockNumber: latest.blockNumber });
    return block.timestamp.toString();
  } catch {
    return "";
  }
}

/** Reads the core facts and maps them into a subgraph-shaped result. */
async function withCore<T>(
  chain: ChainConfig,
  tokenId: bigint,
  map: (core: OnchainNameCore, registrationDate: string) => T,
  includeRegistrationDate = false
): Promise<SubgraphResult<T>> {
  // Resolve ownership first: an unregistered/expired name (or failed read)
  // short-circuits to the fallback error without ever scanning registration
  // logs. Only once the name is known to exist do we reconstruct its
  // registration date, and only when the caller asked for it.
  const core = await readOnchainNameCore(chain, tokenId);
  if (!core) return { data: null, error: FALLBACK_ERROR };

  const registrationDate = includeRegistrationDate
    ? await readRegistrationTimestamp(chain, tokenId)
    : "";
  return { data: map(core, registrationDate), error: null };
}

export const onchainRegistrationData = (
  chain: ChainConfig,
  labelHash: string
): Promise<SubgraphResult<RegistrationData>> =>
  withCore(
    chain,
    BigInt(labelHash),
    (core, registrationDate) => ({
      revoNames: [
        {
          name: "",
          owner: core.owner,
          expiryDateWithGrace: expiryWithGrace(core.expiry),
          resolver: { texts: [], address: resolverOf(chain) },
        },
      ],
      registration: { registrationDate, expiryDate: core.expiry },
      nameRegistereds: [],
    }),
    true
  );

export const onchainOwnershipDetails = (
  chain: ChainConfig,
  labelHash: string
): Promise<SubgraphResult<OwnershipDetailsResult>> =>
  withCore(chain, BigInt(labelHash), core => ({
    revoNames: [{ owner: core.owner, resolver: { address: resolverOf(chain) } }],
  }));

export const onchainDateDetails = (
  chain: ChainConfig,
  labelHash: string
): Promise<SubgraphResult<DateDetailsResult>> =>
  withCore(
    chain,
    BigInt(labelHash),
    (core, registrationDate) => ({
      revoNames: [{ expiryDateWithGrace: expiryWithGrace(core.expiry) }],
      registration: { registrationDate, expiryDate: core.expiry },
    }),
    true
  );

export const onchainNameDetails = (
  chain: ChainConfig,
  labelName: string
): Promise<SubgraphResult<NameDetail[]>> => {
  const labelHash = labelHashFromName(labelName);
  return withCore(
    chain,
    BigInt(labelHash),
    (core, registrationDate) => [
      {
        name: domainName(labelName),
        labelHash,
        expiryDateWithGrace: expiryWithGrace(core.expiry),
        owner: core.owner,
        registration: { registrationDate, expiryDate: core.expiry },
        resolver: { address: resolverOf(chain) },
      },
    ],
    true
  );
};

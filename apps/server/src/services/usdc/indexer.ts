import { getAbiItem, getAddress, type Address, type Log } from "viem";
import { prisma } from "@repo/database";
import { USDC_EIP3009_ABI } from "@repo/web3";
import { env } from "../../env";
import { paymentChain, paymentClient, usdcAddress } from "./chain";
import { recordUsdcTransfers, transfersFromLogs } from "./events";

/**
 * USDC indexer (spec 3.4): every 30 seconds, reads USDC Transfer logs to and
 * from watched Amped.Bio wallets and writes PaymentEvent rows. Only blocks
 * with 12 confirmations are read, so a reorg never writes a row the chain
 * later drops. The cursor lives in site_settings per chain. The CDP Onchain
 * Data webhook can be added later as a faster signal; this poller stays the
 * reconciler.
 *
 * Watched wallets are the ones whose owner opened USDC on Base
 * (users.usdc_wallet_seen_at), which keeps the log filter small.
 */

export const INDEXER_TICK_MS = 30_000;
export const CONFIRMATIONS = 12n;
/** First run looks back this far */
export const INITIAL_LOOKBACK = 200n;
/** Most blocks read per tick, inside public RPC log range limits */
export const MAX_RANGE = 500n;
const ADDRESS_CHUNK = 100;
const TRANSFER_EVENT = getAbiItem({ abi: USDC_EIP3009_ABI, name: "Transfer" });

export function cursorKey(chainId: number) {
  return `usdc_indexer_cursor_${chainId}`;
}

/** The next block range to read, or null when the confirmed head has not moved. */
export function nextRange(
  cursor: bigint | null,
  head: bigint
): { from: bigint; to: bigint } | null {
  const safe = head - CONFIRMATIONS;
  if (safe < 0n) return null;
  const from =
    cursor === null ? (safe > INITIAL_LOOKBACK ? safe - INITIAL_LOOKBACK : 0n) : cursor + 1n;
  if (from > safe) return null;
  const to = from + MAX_RANGE - 1n < safe ? from + MAX_RANGE - 1n : safe;
  return { from, to };
}

async function readCursor(): Promise<bigint | null> {
  const row = await prisma.siteSettings.findUnique({
    where: { setting_key: cursorKey(paymentChain.id) },
  });
  return row ? BigInt(row.setting_value) : null;
}

async function writeCursor(block: bigint) {
  const key = cursorKey(paymentChain.id);
  await prisma.siteSettings.upsert({
    where: { setting_key: key },
    create: { setting_key: key, setting_value: block.toString(), value_type: "NUMBER" },
    update: { setting_value: block.toString() },
  });
}

async function watchedAddresses(): Promise<Address[]> {
  const wallets = await prisma.userWallet.findMany({
    where: { user: { usdc_wallet_seen_at: { not: null } } },
    select: { address: true },
  });
  return wallets.map(w => getAddress(w.address));
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** One indexer pass. Returns the rows written. */
export async function indexUsdcOnce(): Promise<number> {
  const client = paymentClient();
  const range = nextRange(await readCursor(), await client.getBlockNumber());
  if (!range) return 0;

  const addresses = await watchedAddresses();
  const logs: Log[] = [];
  for (const group of chunks(addresses, ADDRESS_CHUNK)) {
    const common = {
      address: usdcAddress(),
      event: TRANSFER_EVENT,
      fromBlock: range.from,
      toBlock: range.to,
    } as const;
    const [outgoing, incoming] = await Promise.all([
      client.getLogs({ ...common, args: { from: group } }),
      client.getLogs({ ...common, args: { to: group } }),
    ]);
    logs.push(...outgoing, ...incoming);
  }

  const blockTimes = new Map<bigint, Date>();
  const written = await recordUsdcTransfers(transfersFromLogs(logs), async blockNumber => {
    const known = blockTimes.get(blockNumber);
    if (known) return known;
    const block = await client.getBlock({ blockNumber });
    const at = new Date(Number(block.timestamp) * 1000);
    blockTimes.set(blockNumber, at);
    return at;
  });
  await writeCursor(range.to);
  return written;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Started from bootstrap.ts. No-op until USDC_ENABLED. */
export function startUsdcIndexer() {
  if (!env.USDC_ENABLED || timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await indexUsdcOnce();
    } catch (error) {
      console.error("[usdc indexer] tick failed", error);
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => void tick(), INDEXER_TICK_MS);
  timer.unref?.();
  void tick();
}

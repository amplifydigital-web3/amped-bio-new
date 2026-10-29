import { getAbiItem, getAddress, hexToString, type Address, type Hex, type Log } from "viem";
import { prisma } from "@repo/database";
import { parseAddressListChange } from "@repo/constants";
import { AMPEDPAY_ABI, AMPEDPAY_ROLES } from "@repo/web3";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";
import { paymentChain, paymentClient } from "../usdc/chain";
import { OUTSIDE_PORTAL_USER_ID } from "./changes";
import { ampedPayAddress, clearOnchainCache, paymentsChain, safeAddress } from "./onchain";
import { safeMode, safeService } from "./safe";

/**
 * AmpedPay admin indexer (spec 3.6 step 5, acceptance 5 and 7). Every 30 seconds it reads
 * the contract's admin events and marks the matching proposed change Applied with the
 * transaction hash. An event with no portal draft behind it (an owner acted in the Safe
 * directly) is logged as its own applied change, so the change log stays complete.
 *
 * It also closes proposals the Safe moved past: when the Safe's nonce passes a proposal
 * that the Safe service reports as not executed, the change reads Superseded.
 *
 * Paid, Share and Refunded are indexed by PAY-2.
 */

export const PAYMENTS_INDEXER_TICK_MS = 30_000;
/** Admin events need few confirmations: a reorg only delays the Applied mark. */
export const ADMIN_EVENT_CONFIRMATIONS = 3n;
export const INITIAL_LOOKBACK = 5_000n;
export const MAX_RANGE = 2_000n;

const EVENTS = [
  getAbiItem({ abi: AMPEDPAY_ABI, name: "ParamChanged" }),
  getAbiItem({ abi: AMPEDPAY_ABI, name: "Paused" }),
  getAbiItem({ abi: AMPEDPAY_ABI, name: "Unpaused" }),
  getAbiItem({ abi: AMPEDPAY_ABI, name: "RoleGranted" }),
  getAbiItem({ abi: AMPEDPAY_ABI, name: "RoleRevoked" }),
];

const ADDRESS_PARAMS = new Set(["treasury", "splitSigner"]);

export function cursorKey(chainId: number) {
  return `ampedpay_admin_cursor_${chainId}`;
}

export function nextRange(
  cursor: bigint | null,
  head: bigint
): { from: bigint; to: bigint } | null {
  const safe = head - ADMIN_EVENT_CONFIRMATIONS;
  if (safe < 0n) return null;
  const from =
    cursor === null ? (safe > INITIAL_LOOKBACK ? safe - INITIAL_LOOKBACK : 0n) : cursor + 1n;
  if (from > safe) return null;
  const to = from + MAX_RANGE - 1n < safe ? from + MAX_RANGE - 1n : safe;
  return { from, to };
}

/** One admin event in the catalog's terms: item id, old and new value in the stored encoding. */
export interface AdminEvent {
  key: string;
  oldValue: string | null;
  newValue: string;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
}

type DecodedLog = Log & { eventName?: string; args?: Record<string, unknown> };

/** Turns decoded AmpedPay logs into catalog changes. Role events other than RELAYER_ROLE are skipped. */
export function adminEventsFromLogs(logs: DecodedLog[]): AdminEvent[] {
  const out: AdminEvent[] = [];
  for (const log of logs) {
    if (!log.transactionHash || log.blockNumber === null || log.logIndex === null) continue;
    const base = {
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
    };
    const args = log.args ?? {};
    switch (log.eventName) {
      case "ParamChanged": {
        const key = hexToString(args.name as Hex, { size: 32 }).replace(/\0+$/, "");
        const asValue = (value: unknown) =>
          ADDRESS_PARAMS.has(key)
            ? getAddress(`0x${(value as bigint).toString(16).padStart(40, "0")}`)
            : (value as bigint).toString();
        out.push({
          ...base,
          key,
          oldValue: asValue(args.oldValue),
          newValue: asValue(args.newValue),
        });
        break;
      }
      case "Paused":
        out.push({ ...base, key: "contract_paused", oldValue: "false", newValue: "true" });
        break;
      case "Unpaused":
        out.push({ ...base, key: "contract_paused", oldValue: "true", newValue: "false" });
        break;
      case "RoleGranted":
      case "RoleRevoked": {
        if (args.role !== AMPEDPAY_ROLES.RELAYER_ROLE) break;
        const account = getAddress(args.account as Address);
        out.push({
          ...base,
          key: "relayers",
          oldValue: null,
          newValue: `${log.eventName === "RoleGranted" ? "add" : "remove"}:${account}`,
        });
        break;
      }
    }
  }
  return out.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1
  );
}

function sameValue(key: string, a: string, b: string): boolean {
  if (key === "relayers") {
    const left = parseAddressListChange(a);
    const right = parseAddressListChange(b);
    return (
      !!left &&
      !!right &&
      left.action === right.action &&
      left.address.toLowerCase() === right.address.toLowerCase()
    );
  }
  return ADDRESS_PARAMS.has(key) ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Records one event: the oldest waiting change with the same key and value becomes Applied,
 * or a new applied row is written when nothing matches. A transaction already logged (the
 * pause the portal sent) is skipped. Returns true when a row changed.
 */
export async function recordAdminEvent(event: AdminEvent, at: Date): Promise<boolean> {
  const logged = await prisma.adminChange.findFirst({
    where: { area: "payments", txHash: event.txHash, key: event.key },
    select: { id: true },
  });
  if (logged) return false;

  const waiting = await prisma.adminChange.findMany({
    where: {
      area: "payments",
      target: "contract",
      key: event.key,
      status: { in: ["proposed", "approved"] },
    },
    orderBy: { createdAt: "asc" },
  });
  const match = waiting.find(change => sameValue(event.key, change.newValue, event.newValue));
  if (match) {
    const claimed = await prisma.adminChange.updateMany({
      where: { id: match.id, status: match.status },
      data: { status: "applied", txHash: event.txHash, appliedAt: at, chainId: paymentChain.id },
    });
    return claimed.count > 0;
  }

  await prisma.adminChange.create({
    data: {
      id: uuidv7(),
      area: "payments",
      target: "contract",
      key: event.key,
      oldValue: event.oldValue ?? "",
      newValue: event.newValue,
      reason: "Changed on chain outside the portal.",
      status: "applied",
      draftedById: OUTSIDE_PORTAL_USER_ID,
      decisionNote: "Read from the contract. No portal draft matched this transaction.",
      txHash: event.txHash,
      chainId: paymentChain.id,
      createdAt: at,
      decidedAt: at,
      appliedAt: at,
    },
  });
  return true;
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

/** One pass over new blocks. Returns the rows changed. */
export async function indexAdminEventsOnce(): Promise<number> {
  const contract = ampedPayAddress();
  if (!contract) return 0;
  const client = paymentClient();
  const range = nextRange(await readCursor(), await client.getBlockNumber());
  if (!range) return 0;

  const logs = (await client.getLogs({
    address: contract,
    events: EVENTS,
    fromBlock: range.from,
    toBlock: range.to,
  })) as DecodedLog[];

  const blockTimes = new Map<bigint, Date>();
  let changed = 0;
  for (const event of adminEventsFromLogs(logs)) {
    let at = blockTimes.get(event.blockNumber);
    if (!at) {
      const block = await client.getBlock({ blockNumber: event.blockNumber });
      at = new Date(Number(block.timestamp) * 1000);
      blockTimes.set(event.blockNumber, at);
    }
    if (await recordAdminEvent(event, at)) changed += 1;
  }
  await writeCursor(range.to);
  if (changed > 0) clearOnchainCache();
  return changed;
}

/**
 * Closes proposals the Safe moved past (spec 3.6 step 6). Service mode only: in manual mode
 * an owner may submit the same call under any nonce, so the event decides and an admin
 * rejects a stale proposal by hand.
 */
export async function supersedeStaleProposals(now = new Date()): Promise<number> {
  const safe = safeAddress();
  if (!safe || safeMode() !== "service") return 0;
  const proposed = await prisma.adminChange.findMany({
    where: { area: "payments", target: "contract", status: "proposed", safeTxHash: { not: null } },
  });
  if (proposed.length === 0) return 0;
  const { nonce } = await paymentsChain().safe(safe);
  let closed = 0;
  for (const change of proposed) {
    if (!change.safeTxHash) continue;
    const status = await safeService().transaction(change.safeTxHash);
    // The service has not seen it, or the Safe has not reached its nonce yet
    if (!status || status.nonce >= nonce) continue;
    // Executed: the event marks it Applied, or it failed inside the Safe
    if (status.executed && status.successful !== false) continue;
    const result = await prisma.adminChange.updateMany({
      where: { id: change.id, status: "proposed" },
      data: {
        status: "superseded",
        decidedAt: now,
        decisionNote: status.executed
          ? "The Safe executed it and the call reverted. Draft it again."
          : "Another Safe transaction used this nonce. Draft it again.",
      },
    });
    closed += result.count;
  }
  return closed;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Started from bootstrap.ts. No-op until AMPEDPAY_ADDRESS is set. */
export function startPaymentsAdminIndexer() {
  if (!env.AMPEDPAY_ADDRESS || timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await indexAdminEventsOnce();
      await supersedeStaleProposals();
    } catch (error) {
      console.error("[payments indexer] tick failed", error);
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => void tick(), PAYMENTS_INDEXER_TICK_MS);
  timer.unref?.();
  void tick();
}

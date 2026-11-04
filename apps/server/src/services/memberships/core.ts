/**
 * Join, cancel and end a membership on AmpedMemberships (MB-1; docs/features/ampedmemberships.md
 * 2 and 4, memberships spec 3.4 to 3.6 with amendment 1).
 *
 * Join: the server builds the join table (creator and platform rows, the fee from Admin,
 * Payments), the split signer signs it, the fan signs the same table and a USDC permit for
 * the allowance every one of their memberships needs together, and the relayer calls join.
 * The first period is pulled in that call. Nothing here holds USDC.
 *
 * Cancel: one signature on Cancel(subscriptionRef, deadline), sent by the relayer. Charges
 * stop at once; access runs to the period end, off chain. End: the platform stops charges
 * (past due beyond the grace, seller lapsed, plan removed, account deleted).
 */
import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  hashTypedData,
  isAddress,
  isAddressEqual,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { prisma } from "@repo/database";
import {
  MEMBERSHIP_ALLOWANCE_PERIODS,
  MEMBERSHIP_LIMITS,
  MEMBERSHIP_PERIOD_SECONDS,
  type MembershipEndReason,
  type MembershipInterval,
  type MembershipJoinPrepareResult,
  type MembershipStatus,
  type MembershipSubmitResult,
} from "@repo/constants";
import {
  AMPEDMEMBERSHIPS_ABI,
  JOIN_TABLE_TYPES,
  MEMBERSHIP_CANCEL_TYPES,
  SPLIT_ROLES,
  USDC_NONCES_ABI,
  USDC_PERMIT_TYPES,
  ampedMembershipsDomain,
  membershipIdFromRef,
  membershipRef,
  planRef,
} from "@repo/web3";
import { uuidv7 } from "../../utils/uuid-v7";
import { getUsdcBalance, paymentChain, paymentClient, usdcDomain } from "../usdc/chain";
import { RelayerError, getRelayer } from "../usdc/relayer";
import { ScreeningUnavailableError, screenAddress } from "../usdc/screen";
import { checkIdentity } from "../identity/checks";
import { ampedMembershipsAddress } from "../payments/onchain";
import { paymentsReady } from "../payments/ready";
import { paymentSettings } from "../payments/settings";
import { accountAddress, paymentsCdp } from "../payments/accounts";
import { liveVersion, versionSummary } from "../store/policy";

const BPS = 10_000;
const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");
const IN_FLIGHT = ["prepared", "joining"] as const;
/**
 * Statuses whose remaining periods must fit in a new permit: the ones that charge now, plus
 * a join already sent, because it becomes a charging membership before this permit is used.
 */
const CHARGING = ["active", "past_due", "joining"] as const;

export type JoinRecipient = { to: Address; bps: number; role: number };
export type JoinTable = {
  subscriptionRef: Hex;
  planRef: Hex;
  member: Address;
  price: bigint;
  periodSeconds: number;
  recipients: JoinRecipient[];
  validBefore: bigint;
};

/** What a Membership row stores of its table, to rebuild it exactly at submit. */
type StoredJoin = {
  planRef: Hex;
  recipients: JoinRecipient[];
  validBefore: string;
  splitSignature: Hex;
  permitDeadline: string;
  permitNonce: string;
};

// ------------------------------------------------------------------ signing seam

export interface JoinSigner {
  address(): Promise<Address>;
  sign(table: JoinTable, chainId: number, contract: Address): Promise<Hex>;
}

const cdpJoinSigner: JoinSigner = {
  address: () => accountAddress("splitSigner"),
  async sign(table, chainId, contract) {
    const address = await accountAddress("splitSigner");
    // CDP wants integers as decimal strings
    const { signature } = await paymentsCdp().signEvmTypedData(address, {
      domain: ampedMembershipsDomain(chainId, contract),
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        JoinTable: [...JOIN_TABLE_TYPES.JoinTable],
        Recipient: [...JOIN_TABLE_TYPES.Recipient],
      },
      primaryType: "JoinTable",
      message: {
        subscriptionRef: table.subscriptionRef,
        planRef: table.planRef,
        member: table.member,
        price: table.price.toString(),
        periodSeconds: String(table.periodSeconds),
        recipients: table.recipients.map(r => ({
          to: r.to,
          bps: String(r.bps),
          role: String(r.role),
        })),
        validBefore: table.validBefore.toString(),
      },
    });
    return signature as Hex;
  },
};

let joinSigner: JoinSigner | null = null;
export function setJoinSignerForTests(next: JoinSigner | null) {
  joinSigner = next;
}
const signer = () => joinSigner ?? cdpJoinSigner;

function typedJoin(table: JoinTable) {
  return {
    subscriptionRef: table.subscriptionRef,
    planRef: table.planRef,
    member: table.member,
    price: table.price,
    periodSeconds: table.periodSeconds,
    recipients: table.recipients.map(r => ({ to: r.to, bps: r.bps, role: r.role })),
    validBefore: table.validBefore,
  };
}

/** The EIP-712 digest AmpedMemberships.hashJoin returns. */
export function hashJoin(table: JoinTable, chainId: number, contract: Address): Hex {
  return hashTypedData({
    domain: ampedMembershipsDomain(chainId, contract),
    types: JOIN_TABLE_TYPES,
    primaryType: "JoinTable",
    message: typedJoin(table),
  });
}

/** Creator and platform rows: the fee from settings, the creator gets the rest. */
export function joinRecipients(
  creator: Address,
  treasury: Address,
  platformFeeBps: number
): JoinRecipient[] {
  return [
    { to: getAddress(creator), bps: BPS - platformFeeBps, role: SPLIT_ROLES.creator },
    { to: getAddress(treasury), bps: platformFeeBps, role: SPLIT_ROLES.platform },
  ];
}

/** The platform share of one period, with the contract's floor rounding. */
export function periodFee(price: bigint, recipients: JoinRecipient[]): bigint {
  return recipients
    .filter(r => r.role === SPLIT_ROLES.platform)
    .reduce((sum, r) => sum + (price * BigInt(r.bps)) / BigInt(BPS), 0n);
}

async function readTreasury(contract: Address): Promise<Address | null> {
  try {
    return getAddress(
      (await paymentClient().readContract({
        address: contract,
        abi: AMPEDMEMBERSHIPS_ABI,
        functionName: "treasury",
      })) as Address
    );
  } catch {
    return null;
  }
}

async function chainPaused(contract: Address): Promise<boolean> {
  try {
    return (await paymentClient().readContract({
      address: contract,
      abi: AMPEDMEMBERSHIPS_ABI,
      functionName: "paused",
    })) as boolean;
  } catch {
    return true;
  }
}

async function permitNonce(owner: Address): Promise<bigint> {
  const usdc = await usdcDomain();
  return (await paymentClient().readContract({
    address: usdc.verifyingContract as Address,
    abi: USDC_NONCES_ABI,
    functionName: "nonces",
    args: [owner],
  })) as bigint;
}

/**
 * The allowance a new permit should set: every membership that can still charge needs its
 * periods (12 every 30 days, 2 yearly), because one permit covers this contract for all of
 * the fan's memberships together (ampedmemberships.md 4).
 */
export async function allowanceFor(
  fanUserId: number,
  next: { price: bigint; interval: MembershipInterval }
): Promise<bigint> {
  const others = await prisma.membership.findMany({
    where: { fanUserId, status: { in: [...CHARGING] } },
    select: { pricePerPeriod: true, interval: true },
  });
  const need = (price: bigint, interval: string) =>
    price * BigInt(MEMBERSHIP_ALLOWANCE_PERIODS[interval as MembershipInterval] ?? 1);
  return others.reduce(
    (sum, row) => sum + need(row.pricePerPeriod, row.interval),
    need(next.price, next.interval)
  );
}

// ------------------------------------------------------------------ join

export async function prepareJoin(
  fanUserId: number,
  input: { handle: string; interval: MembershipInterval; signer?: string },
  now = new Date()
): Promise<MembershipJoinPrepareResult> {
  const creator = await prisma.user.findFirst({
    where: { handle: input.handle.replace(/^@/, "").toLowerCase() },
    select: { id: true, handle: true, membershipPlan: true },
  });
  const plan = creator?.membershipPlan;
  if (!creator || !plan || plan.status !== "active") return { refused: true, reason: "not_found" };
  if (creator.id === fanUserId) return { refused: true, reason: "own_plan" };
  const price = input.interval === "yearly" ? plan.amountYearly : plan.amountEvery30Days;
  if (!price) return { refused: true, reason: "not_found" };

  // "joining" counts: a join that is already on its way to the chain is a membership in
  // flight, and a second join would be a second subscription and a second charge. "prepared"
  // does not count: a second prepare replaces an unsigned first one (below).
  const current = await prisma.membership.findFirst({
    where: {
      fanUserId,
      creatorUserId: creator.id,
      OR: [
        { status: { in: ["joining", "active", "past_due"] } },
        { status: "canceled", currentPeriodEnd: { gt: now } },
      ],
    },
    select: { id: true },
  });
  if (current) return { refused: true, reason: "already_member" };

  const contract = ampedMembershipsAddress();
  if (!contract || !paymentsReady()) return { refused: true, reason: "paused" };
  const settings = await paymentSettings(now.getTime());
  if (settings.paymentsPaused || (await chainPaused(contract))) {
    return { refused: true, reason: "paused" };
  }
  if (!(await checkIdentity(creator.id, "seller")).pass) return { refused: true, reason: "seller" };

  const [creatorWallet, fan] = await Promise.all([
    prisma.userWallet.findUnique({ where: { userId: creator.id }, select: { address: true } }),
    prisma.user.findUnique({
      where: { id: fanUserId },
      select: { wallet: { select: { address: true } } },
    }),
  ]);
  if (!creatorWallet?.address || !isAddress(creatorWallet.address, { strict: false })) {
    return { refused: true, reason: "seller" };
  }
  if (!fan?.wallet?.address || !isAddress(fan.wallet.address, { strict: false })) {
    return { refused: true, reason: "no_wallet" };
  }
  const member = getAddress(fan.wallet.address);
  if (
    input.signer !== undefined &&
    (!isAddress(input.signer, { strict: false }) || !isAddressEqual(input.signer, member))
  ) {
    return { refused: true, reason: "wallet_mismatch" };
  }
  const creatorAddress = getAddress(creatorWallet.address);
  if (isAddressEqual(member, creatorAddress)) return { refused: true, reason: "own_plan" };

  const balance = await getUsdcBalance(member);
  if (balance < price) {
    return { refused: true, reason: "insufficient_balance", shortBy: (price - balance).toString() };
  }
  try {
    const own = await screenAddress(member, "own_address", fanUserId);
    const seller = own.allowed
      ? await screenAddress(creatorAddress, "send_destination", fanUserId)
      : own;
    if (!own.allowed || !seller.allowed) return { refused: true, reason: "screening" };
  } catch (error) {
    if (error instanceof ScreeningUnavailableError) return { refused: true, reason: "paused" };
    throw error;
  }

  const treasury = await readTreasury(contract);
  if (!treasury) return { refused: true, reason: "paused" };
  const recipients = joinRecipients(creatorAddress, treasury, settings.platformFeeBps);
  const id = uuidv7();
  const nowSeconds = BigInt(Math.floor(now.getTime() / 1000));
  const validBefore = nowSeconds + BigInt(MEMBERSHIP_LIMITS.joinWindowSeconds);
  const table: JoinTable = {
    subscriptionRef: membershipRef(id),
    planRef: planRef(hex(plan.id), plan.version),
    member,
    price,
    periodSeconds: MEMBERSHIP_PERIOD_SECONDS[input.interval],
    recipients,
    validBefore,
  };
  const splitSignature = await signer().sign(table, paymentChain.id, contract);
  const joinHash = hashJoin(table, paymentChain.id, contract);
  const allowance = await allowanceFor(fanUserId, { price, interval: input.interval });
  const nonce = await permitNonce(member);
  const usdc = await usdcDomain();
  const live = await liveVersion(creator.id);
  const summary = live ? versionSummary(live) : null;

  // A second prepare replaces an unsigned first one
  await prisma.membership.updateMany({
    where: { fanUserId, planId: plan.id, status: "prepared" },
    data: { status: "failed", failureCode: "replaced" },
  });
  const stored: StoredJoin = {
    planRef: table.planRef,
    recipients,
    validBefore: validBefore.toString(),
    splitSignature,
    permitDeadline: validBefore.toString(),
    permitNonce: nonce.toString(),
  };
  await prisma.membership.create({
    data: {
      id,
      planId: plan.id,
      planVersion: plan.version,
      fanUserId,
      creatorUserId: creator.id,
      interval: input.interval,
      status: "prepared",
      chainId: paymentChain.id,
      member,
      creatorAddress,
      pricePerPeriod: price,
      fee: periodFee(price, recipients),
      periodSeconds: table.periodSeconds,
      joinTable: stored,
      joinHash,
      permitValue: allowance,
      storePolicyVersionId: live?.id ?? null,
    },
  });

  return {
    refused: false,
    membershipId: hex(id),
    amount: price.toString(),
    fee: periodFee(price, recipients).toString(),
    interval: input.interval,
    allowance: allowance.toString(),
    sellerName: summary?.sellerName ?? `@${creator.handle}`,
    storePolicyVersion: summary?.version ?? null,
    signer: member,
    typed: {
      join: {
        domain: ampedMembershipsDomain(paymentChain.id, contract),
        message: {
          subscriptionRef: table.subscriptionRef,
          planRef: table.planRef,
          member,
          price: price.toString(),
          periodSeconds: table.periodSeconds,
          recipients: recipients.map(r => ({ to: r.to, bps: r.bps, role: r.role })),
          validBefore: validBefore.toString(),
        },
      },
      permit: {
        domain: {
          name: usdc.name,
          version: usdc.version,
          chainId: paymentChain.id,
          verifyingContract: usdc.verifyingContract as `0x${string}`,
        },
        message: {
          owner: member,
          spender: contract,
          value: allowance.toString(),
          nonce: nonce.toString(),
          deadline: validBefore.toString(),
        },
      },
    },
  };
}

type MembershipRow = NonNullable<Awaited<ReturnType<typeof prisma.membership.findUnique>>>;

function tableOf(row: MembershipRow): { table: JoinTable; stored: StoredJoin } {
  const stored = row.joinTable as unknown as StoredJoin;
  return {
    stored,
    table: {
      subscriptionRef: membershipRef(row.id),
      planRef: stored.planRef,
      member: getAddress(row.member),
      price: row.pricePerPeriod,
      periodSeconds: row.periodSeconds,
      recipients: stored.recipients.map(r => ({ to: getAddress(r.to), bps: r.bps, role: r.role })),
      validBefore: BigInt(stored.validBefore),
    },
  };
}

export function encodeJoinCall(
  table: JoinTable,
  splitSig: Hex,
  memberSig: Hex,
  permit: { value: bigint; deadline: bigint; signature: Hex }
): Hex {
  return encodeFunctionData({
    abi: AMPEDMEMBERSHIPS_ABI,
    functionName: "join",
    args: [typedJoin(table), splitSig, memberSig, permit.value, permit.deadline, permit.signature],
  });
}

async function ownMembership(fanUserId: number, idHex: string) {
  const row = await prisma.membership.findUnique({ where: { id: Buffer.from(idHex, "hex") } });
  return row && row.fanUserId === fanUserId ? row : null;
}

export async function submitJoin(
  fanUserId: number,
  input: { membershipId: string; memberSignature: string; permitSignature: string },
  now = new Date(),
  receiptWaitMs = 20_000
): Promise<MembershipSubmitResult> {
  const row = await ownMembership(fanUserId, input.membershipId);
  if (!row) return { refused: true, reason: "not_found" };
  if (row.status !== "prepared") {
    return {
      refused: false,
      membershipId: input.membershipId,
      status: row.status as MembershipStatus,
      txHash: row.joinTxHash,
    };
  }
  const contract = ampedMembershipsAddress();
  if (!contract || !paymentsReady()) return { refused: true, reason: "paused" };
  const { table, stored } = tableOf(row);
  if (table.validBefore <= BigInt(Math.floor(now.getTime() / 1000))) {
    await prisma.membership.updateMany({
      where: { id: row.id, status: "prepared" },
      data: { status: "failed", failureCode: "expired" },
    });
    return { refused: true, reason: "expired" };
  }

  const usdc = await usdcDomain();
  try {
    const [joinSignerAddress, permitSigner] = await Promise.all([
      recoverTypedDataAddress({
        domain: ampedMembershipsDomain(row.chainId, contract),
        types: JOIN_TABLE_TYPES,
        primaryType: "JoinTable",
        message: typedJoin(table),
        signature: input.memberSignature as Hex,
      }),
      recoverTypedDataAddress({
        domain: {
          name: usdc.name,
          version: usdc.version,
          chainId: row.chainId,
          verifyingContract: usdc.verifyingContract as Address,
        },
        types: USDC_PERMIT_TYPES,
        primaryType: "Permit",
        message: {
          owner: table.member,
          spender: contract,
          value: row.permitValue,
          nonce: BigInt(stored.permitNonce),
          deadline: BigInt(stored.permitDeadline),
        },
        signature: input.permitSignature as Hex,
      }),
    ]);
    if (
      !isAddressEqual(joinSignerAddress, table.member) ||
      !isAddressEqual(permitSigner, table.member)
    ) {
      return { refused: true, reason: "signature" };
    }
  } catch {
    return { refused: true, reason: "signature" };
  }
  if ((await getUsdcBalance(table.member)) < table.price) {
    return { refused: true, reason: "insufficient_balance" };
  }

  const claimed = await prisma.membership.updateMany({
    where: { id: row.id, status: "prepared" },
    data: { status: "joining" },
  });
  if (claimed.count === 0) {
    return { refused: false, membershipId: input.membershipId, status: "joining", txHash: null };
  }

  let txHash: Hex;
  try {
    txHash = await getRelayer().call(
      contract,
      encodeJoinCall(table, stored.splitSignature, input.memberSignature as Hex, {
        value: row.permitValue,
        deadline: BigInt(stored.permitDeadline),
        signature: input.permitSignature as Hex,
      }),
      `join:${input.membershipId}`
    );
  } catch (error) {
    const code = error instanceof RelayerError ? error.code : "unavailable";
    await prisma.membership.update({
      where: { id: row.id },
      data: { status: "failed", failureCode: code },
    });
    return { refused: true, reason: "relayer" };
  }
  await prisma.membership.update({ where: { id: row.id }, data: { joinTxHash: txHash } });
  const status = await settleJoin(row.id, receiptWaitMs);
  return { refused: false, membershipId: input.membershipId, status, txHash };
}

// ------------------------------------------------------------------ events

export type MembershipLog =
  | {
      kind: "membership_joined";
      ref: Hex;
      member: Address;
      creator: Address;
      price: bigint;
      nextDue: bigint;
    }
  | {
      kind: "membership_charged";
      ref: Hex;
      member: Address;
      amount: bigint;
      charge: number;
      nextDue: bigint;
    }
  | { kind: "membership_share"; ref: Hex; to: Address; role: number; amount: bigint }
  | { kind: "membership_canceled"; ref: Hex; member: Address; endedBy: number };

export function decodeMembershipLogs(
  logs: Log[],
  contract: Address
): (MembershipLog & { log: Log })[] {
  const out: (MembershipLog & { log: Log })[] = [];
  for (const log of logs) {
    if (!log.address || !isAddressEqual(log.address, contract)) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: AMPEDMEMBERSHIPS_ABI, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    const a = decoded.args as Record<string, unknown>;
    switch (decoded.eventName) {
      case "Joined":
        out.push({
          log,
          kind: "membership_joined",
          ref: a.subscriptionRef as Hex,
          member: getAddress(a.member as Address),
          creator: getAddress(a.creator as Address),
          price: a.price as bigint,
          nextDue: BigInt(a.nextDue as bigint),
        });
        break;
      case "Charged":
        out.push({
          log,
          kind: "membership_charged",
          ref: a.subscriptionRef as Hex,
          member: getAddress(a.member as Address),
          amount: a.amount as bigint,
          charge: Number(a.charge),
          nextDue: BigInt(a.nextDue as bigint),
        });
        break;
      case "Share":
        out.push({
          log,
          kind: "membership_share",
          ref: a.subscriptionRef as Hex,
          to: getAddress(a.to as Address),
          role: Number(a.role),
          amount: a.amount as bigint,
        });
        break;
      case "Canceled":
        out.push({
          log,
          kind: "membership_canceled",
          ref: a.subscriptionRef as Hex,
          member: getAddress(a.member as Address),
          endedBy: Number(a.endedBy),
        });
        break;
    }
  }
  return out;
}

/** Stores membership logs as PaymentEvent rows, once each (refType membership). */
export async function recordMembershipLogs(
  events: (MembershipLog & { log: Log })[],
  occurredAt: Date,
  contract: Address
): Promise<number> {
  let written = 0;
  for (const event of events) {
    const { log } = event;
    if (!log.transactionHash || log.blockNumber === null || log.logIndex === null) continue;
    if (event.kind === "membership_joined") continue; // Charged carries the money
    const idHex = membershipIdFromRef(event.ref);
    const row = idHex
      ? await prisma.membership.findUnique({
          where: { id: Buffer.from(idHex, "hex") },
          select: { id: true, fanUserId: true, creatorUserId: true, fee: true },
        })
      : null;
    const base = {
      id: uuidv7(),
      kind: event.kind,
      chainId: paymentChain.id,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber,
      blockHash: log.blockHash ?? null,
      paymentRef: event.ref,
      refType: row ? "membership" : null,
      refId: row ? Buffer.from(row.id) : null,
      occurredAt,
    };
    const data =
      event.kind === "membership_charged"
        ? {
            ...base,
            fromAddress: event.member,
            toAddress: contract,
            payerUserId: row?.fanUserId ?? null,
            payeeUserId: row?.creatorUserId ?? null,
            amount: event.amount,
            fee: row?.fee ?? 0n,
          }
        : event.kind === "membership_share"
          ? {
              ...base,
              fromAddress: contract,
              toAddress: event.to,
              payeeUserId: event.role === SPLIT_ROLES.creator ? (row?.creatorUserId ?? null) : null,
              amount: event.amount,
              role: event.role,
            }
          : {
              ...base,
              fromAddress: event.member,
              toAddress: contract,
              payerUserId: row?.fanUserId ?? null,
              amount: 0n,
            };
    try {
      await prisma.paymentEvent.create({ data });
      written += 1;
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2002") throw error;
    }
  }
  return written;
}

/** Applies a Charged log to its Membership: active, the new period, past due cleared. */
export async function applyCharge(
  id: Uint8Array,
  charge: { charge: number; nextDue: bigint; txHash: string | null },
  chargedAt: Date
) {
  const end = new Date(Number(charge.nextDue) * 1000);
  return prisma.membership.updateMany({
    where: {
      id: Buffer.from(id),
      status: { in: ["joining", "active", "past_due", "failed"] },
      chargeCount: { lt: charge.charge },
    },
    data: {
      status: "active",
      chargeCount: charge.charge,
      currentPeriodStart: chargedAt,
      currentPeriodEnd: end,
      lastChargeTxHash: charge.txHash,
      pastDueSince: null,
      notReadyAt: null,
      lastReminderDay: null,
      failureCode: null,
    },
  });
}

/** Moves a sent join forward from its receipt. Safe to call again. */
export async function settleJoin(id: Uint8Array, waitMs = 0): Promise<MembershipStatus> {
  const row = await prisma.membership.findUnique({ where: { id: Buffer.from(id) } });
  if (!row) return "failed";
  if (row.status !== "joining" || !row.joinTxHash) return row.status as MembershipStatus;
  const contract = ampedMembershipsAddress();
  if (!contract) return row.status as MembershipStatus;
  const client = paymentClient();
  const hash = row.joinTxHash as Hex;
  let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | null = null;
  try {
    receipt =
      waitMs > 0
        ? await client.waitForTransactionReceipt({ hash, timeout: waitMs })
        : await client.getTransactionReceipt({ hash });
  } catch {
    receipt = null;
  }
  if (!receipt) return "joining";
  const ref = membershipRef(row.id).toLowerCase();
  const events = receipt.status === "success" ? decodeMembershipLogs(receipt.logs, contract) : [];
  const charged = events.find(e => e.kind === "membership_charged" && e.ref.toLowerCase() === ref);
  if (receipt.status !== "success" || !charged || charged.kind !== "membership_charged") {
    await prisma.membership.updateMany({
      where: { id: row.id, status: "joining" },
      data: {
        status: "failed",
        failureCode: receipt.status === "success" ? "no_charge" : "reverted",
      },
    });
    return "failed";
  }
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const at = new Date(Number(block.timestamp) * 1000);
  await applyCharge(row.id, { charge: charged.charge, nextDue: charged.nextDue, txHash: hash }, at);
  await recordMembershipLogs(events, at, contract);
  return "active";
}

// ------------------------------------------------------------------ cancel and end

export async function prepareCancel(fanUserId: number, membershipId: string, now = new Date()) {
  const row = await ownMembership(fanUserId, membershipId);
  if (!row || !["active", "past_due"].includes(row.status)) {
    return { refused: true as const, reason: "not_found" as const };
  }
  const contract = ampedMembershipsAddress();
  if (!contract) return { refused: true as const, reason: "paused" as const };
  const deadline = BigInt(Math.floor(now.getTime() / 1000) + MEMBERSHIP_LIMITS.cancelWindowSeconds);
  return {
    refused: false as const,
    membershipId,
    signer: getAddress(row.member),
    accessUntil: row.currentPeriodEnd?.toISOString() ?? null,
    typed: {
      domain: ampedMembershipsDomain(row.chainId, contract),
      message: { subscriptionRef: membershipRef(row.id), deadline: deadline.toString() },
    },
  };
}

/**
 * Sends the member's signed Cancel. Charges stop now; access runs to the period end. Works
 * while payments are paused: a member can always stop the charges.
 */
export async function submitCancel(
  fanUserId: number,
  input: { membershipId: string; deadline: string; signature: string },
  now = new Date()
): Promise<MembershipSubmitResult> {
  const row = await ownMembership(fanUserId, input.membershipId);
  if (!row) return { refused: true, reason: "not_found" };
  if (row.status === "canceled" || row.status === "ended") {
    return { refused: false, membershipId: input.membershipId, status: row.status, txHash: null };
  }
  if (!["active", "past_due"].includes(row.status)) return { refused: true, reason: "not_found" };
  const contract = ampedMembershipsAddress();
  if (!contract) return { refused: true, reason: "paused" };
  const deadline = BigInt(input.deadline);
  if (deadline <= BigInt(Math.floor(now.getTime() / 1000)))
    return { refused: true, reason: "expired" };
  try {
    const recovered = await recoverTypedDataAddress({
      domain: ampedMembershipsDomain(row.chainId, contract),
      types: MEMBERSHIP_CANCEL_TYPES,
      primaryType: "Cancel",
      message: { subscriptionRef: membershipRef(row.id), deadline },
      signature: input.signature as Hex,
    });
    if (!isAddressEqual(recovered, row.member as Address))
      return { refused: true, reason: "signature" };
  } catch {
    return { refused: true, reason: "signature" };
  }
  let txHash: Hex;
  try {
    txHash = await getRelayer().call(
      contract,
      encodeFunctionData({
        abi: AMPEDMEMBERSHIPS_ABI,
        functionName: "cancelWithSignature",
        args: [membershipRef(row.id), deadline, input.signature as Hex],
      }),
      `cancel:${input.membershipId}`
    );
  } catch {
    return { refused: true, reason: "relayer" };
  }
  // A past due member has no period left: their access ends now
  const status: MembershipStatus = row.status === "past_due" ? "ended" : "canceled";
  await prisma.membership.updateMany({
    where: { id: row.id, status: { in: ["active", "past_due"] } },
    data: {
      status,
      canceledAt: now,
      endTxHash: txHash,
      ...(status === "ended" ? { endedAt: now, endReason: "member_canceled" } : {}),
    },
  });
  return { refused: false, membershipId: input.membershipId, status, txHash };
}

/** The platform stops charges. Ending never moves money, so it needs no member signature. */
export async function endByPlatform(
  id: Uint8Array,
  reason: MembershipEndReason,
  now = new Date()
): Promise<boolean> {
  const contract = ampedMembershipsAddress();
  if (!contract) return false;
  const row = await prisma.membership.findUnique({
    where: { id: Buffer.from(id) },
    select: { id: true, status: true },
  });
  if (!row || row.status === "ended") return false;
  let txHash: Hex | null = null;
  try {
    txHash = await getRelayer().call(
      contract,
      encodeFunctionData({
        abi: AMPEDMEMBERSHIPS_ABI,
        functionName: "endByPlatform",
        args: [membershipRef(row.id)],
      }),
      `end:${hex(row.id)}`
    );
  } catch (error) {
    console.warn("[memberships] end not sent", hex(row.id), (error as Error).message);
    return false;
  }
  const moved = await prisma.membership.updateMany({
    where: { id: row.id, status: { not: "ended" } },
    data: { status: "ended", endedAt: now, endReason: reason, endTxHash: txHash },
  });
  return moved.count > 0;
}

/** Statuses a fan's in flight join can be in, for the pay sheet poll. */
export async function joinStatus(fanUserId: number, membershipId: string) {
  const row = await ownMembership(fanUserId, membershipId);
  if (!row) return null;
  if (row.status === "joining") await settleJoin(row.id);
  const fresh = await ownMembership(fanUserId, membershipId);
  return fresh
    ? {
        status: fresh.status as MembershipStatus,
        accessUntil: fresh.currentPeriodEnd?.toISOString() ?? null,
        inFlight: (IN_FLIGHT as readonly string[]).includes(fresh.status),
      }
    : null;
}

/** Joins whose submit response was lost: the payments worker settles them from receipts. */
export async function settlePendingJoinsOnce(now = new Date()): Promise<number> {
  const rows = await prisma.membership.findMany({
    where: { status: "joining", joinTxHash: { not: null } },
    orderBy: { updatedAt: "asc" },
    take: 50,
    select: { id: true, updatedAt: true },
  });
  let moved = 0;
  for (const row of rows) {
    const status = await settleJoin(row.id);
    if (status !== "joining") moved += 1;
    else if (now.getTime() - row.updatedAt.getTime() > 30 * 60 * 1000) {
      // Never seen on chain after 30 minutes: the join was dropped
      await prisma.membership.updateMany({
        where: { id: row.id, status: "joining" },
        data: { status: "failed", failureCode: "dropped" },
      });
      moved += 1;
    }
  }
  // Prepared rows the fan never signed
  await prisma.membership.updateMany({
    where: { status: "prepared", createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    data: { status: "failed", failureCode: "expired" },
  });
  return moved;
}

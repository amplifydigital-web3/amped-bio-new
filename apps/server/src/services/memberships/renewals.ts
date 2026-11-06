/**
 * Renewals (MB-1; amendment 1 3.5, decision 4 as replaced, ampedmemberships.md 4). Hourly:
 *
 * 1. Readiness: 3 days before a charge, read the member's allowance to AmpedMemberships and
 *    their USDC balance. Short on either: one reminder (bell, push and email) with Add USDC
 *    prefilled with the charge.
 * 2. Seller: a creator whose seller pass lapsed has renewals paused; current members keep
 *    access to the period end, then the membership ends (identity checks 5.4, decision S3).
 * 3. Charge: due memberships are renewed through the relayer. A revert (short allowance or
 *    balance) makes the membership past due. Access stays for 7 days.
 * 4. Grace: reminders on day 1, 3 and 6. On day 7 the platform ends the membership.
 * 5. Canceled memberships whose period ran out are ended (no chain call: charges already
 *    stopped at cancel).
 *
 * Every step reads the chain's view first, so a renewal that landed while the job was away
 * is applied, never charged twice. The contract refuses a second charge for a period anyway.
 */
import { render } from "@react-email/render";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { prisma } from "@repo/database";
import {
  MEMBERSHIP_COPY,
  MEMBERSHIP_INTERVAL_WORDS,
  MEMBERSHIP_LIMITS,
  graceDay,
  usdcDollarsLabel,
  type MembershipInterval,
} from "@repo/constants";
import { AMPEDMEMBERSHIPS_ABI, USDC_ALLOWANCE_ABI, USDC_READ_ABI, membershipRef } from "@repo/web3";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";
import { deliverEmail } from "../../utils/email/transport";
import MembershipRenewalTemplate from "../../utils/email/MembershipRenewalTemplate";
import { paymentClient, usdcAddress } from "../usdc/chain";
import { RelayerError, getRelayer } from "../usdc/relayer";
import { checkIdentity } from "../identity/checks";
import { isFeatureOn } from "../featureFlags";
import { sendPush } from "../notifications/push";
import { ampedMembershipsAddress } from "../payments/onchain";
import { paymentsReady } from "../payments/ready";
import { liveVersion, versionSummary } from "../store/policy";
import { applyCharge, decodeMembershipLogs, endByPlatform, recordMembershipLogs } from "./core";

const DAY_MS = 86_400_000;
const BATCH = 100;
const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");

type Row = {
  id: Uint8Array;
  fanUserId: number | null;
  creatorUserId: number | null;
  member: string;
  interval: string;
  pricePerPeriod: bigint;
  status: string;
  chargeCount: number;
  currentPeriodEnd: Date | null;
  pastDueSince: Date | null;
  notReadyAt: Date | null;
  lastReminderDay: number | null;
  renewalPausedAt: Date | null;
};

const ROW_SELECT = {
  id: true,
  fanUserId: true,
  creatorUserId: true,
  member: true,
  interval: true,
  pricePerPeriod: true,
  status: true,
  chargeCount: true,
  currentPeriodEnd: true,
  pastDueSince: true,
  notReadyAt: true,
  lastReminderDay: true,
  renewalPausedAt: true,
} as const;

// ------------------------------------------------------------------ reminders

/** Add USDC for a renewal: the Wallet Buy USDC panel prefilled with the charge (CK-Q74). */
export function addUsdcPath(need: bigint) {
  return `/wallet?fund=usdc&need=${need.toString()}&returnTo=${encodeURIComponent("/library/memberships")}`;
}

export type ReminderKind = "not_ready" | "past_due";

/**
 * One reminder: the bell row (kind MEMBERSHIP_RENEWAL, collapsed per membership, CK-D3), a
 * push and an email. No Telegram and no Messages thread (amendment 3.5).
 */
export async function remind(row: Row, kind: ReminderKind, now = new Date()): Promise<void> {
  if (!row.fanUserId || !row.creatorUserId) return;
  const [fan, creator, live] = await Promise.all([
    prisma.user.findUnique({ where: { id: row.fanUserId }, select: { email: true } }),
    prisma.user.findUnique({ where: { id: row.creatorUserId }, select: { handle: true } }),
    liveVersion(row.creatorUserId),
  ]);
  const handle = creator?.handle ?? "creator";
  const seller = live ? versionSummary(live).sellerName : `@${handle}`;
  const amount = usdcDollarsLabel(row.pricePerPeriod);
  const day = row.pastDueSince ? graceDay(row.pastDueSince, now) : 1;
  const path = addUsdcPath(row.pricePerPeriod);

  // Bell: one row per membership, bumped while unseen
  const groupKey = `renewal:${hex(row.id)}`;
  const unseen = await prisma.notification.findFirst({
    where: { userId: row.fanUserId, groupKey, seenAt: null },
    select: { id: true },
  });
  if (unseen) {
    await prisma.notification.update({
      where: { id: unseen.id },
      data: { count: { increment: 1 }, updatedAt: now },
    });
  } else {
    await prisma.notification.create({
      data: {
        id: uuidv7(),
        userId: row.fanUserId,
        kind: "MEMBERSHIP_RENEWAL",
        actorId: row.creatorUserId,
        refId: Buffer.from(row.id),
        groupKey,
      },
    });
  }

  const C = MEMBERSHIP_COPY;
  const text = kind === "not_ready" ? C.bell.notReady(handle) : C.bell.pastDue(handle, day);
  await sendPush(row.fanUserId, {
    title: C.push.title,
    body: text,
    url: path,
    tag: groupKey,
  }).catch(error => console.warn("[memberships] push failed", (error as Error).message));

  if (fan?.email) {
    const interval = MEMBERSHIP_INTERVAL_WORDS[row.interval as MembershipInterval] ?? "";
    const date = (row.currentPeriodEnd ?? now).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    const until = row.pastDueSince
      ? new Date(
          row.pastDueSince.getTime() + MEMBERSHIP_LIMITS.graceDays * DAY_MS
        ).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })
      : date;
    const html = await render(
      MembershipRenewalTemplate({
        heading:
          kind === "not_ready" ? C.email.subjectNotReady(seller) : C.email.subjectPastDue(seller),
        body:
          kind === "not_ready"
            ? C.email.notReady(seller, amount, interval, date)
            : C.email.pastDue(seller, amount, day, until),
        soldBy: C.email.soldBy(seller),
        addUsdcLabel: C.email.addUsdc,
        addUsdcUrl: new URL(path, env.APP_URL).toString(),
        policyLabel: C.email.policy,
        policyUrl: live
          ? new URL(`/${handle}/store/policy?v=${live.version}`, env.LANDINGPAGE_URL).toString()
          : null,
        manage: C.email.manage,
      })
    );
    await deliverEmail({
      to: [fan.email],
      subject:
        kind === "not_ready" ? C.email.subjectNotReady(seller) : C.email.subjectPastDue(seller),
      html,
    }).catch(error =>
      console.warn("[memberships] reminder email failed", (error as Error).message)
    );
  }
}

// ------------------------------------------------------------------ chain reads

type ChainSub = { nextDue: bigint; charges: number; active: boolean };

async function readSubscription(contract: Address, id: Uint8Array): Promise<ChainSub | null> {
  try {
    const s = (await paymentClient().readContract({
      address: contract,
      abi: AMPEDMEMBERSHIPS_ABI,
      functionName: "getSubscription",
      args: [membershipRef(id)],
    })) as { nextDue: bigint; charges: number; active: boolean };
    return { nextDue: BigInt(s.nextDue), charges: Number(s.charges), active: s.active };
  } catch {
    return null;
  }
}

/** True when the member's allowance and balance both cover one more charge. */
export async function readyToRenew(contract: Address, member: Address, price: bigint) {
  const client = paymentClient();
  const [allowance, balance] = await Promise.all([
    client.readContract({
      address: usdcAddress(),
      abi: USDC_ALLOWANCE_ABI,
      functionName: "allowance",
      args: [member, contract],
    }) as Promise<bigint>,
    client.readContract({
      address: usdcAddress(),
      abi: USDC_READ_ABI,
      functionName: "balanceOf",
      args: [member],
    }) as Promise<bigint>,
  ]);
  return allowance >= price && balance >= price;
}

// ------------------------------------------------------------------ steps

/** Step 1: the readiness check, once per period. */
export async function readinessOnce(contract: Address, now = new Date()): Promise<number> {
  const rows = await prisma.membership.findMany({
    where: {
      status: "active",
      notReadyAt: null,
      renewalPausedAt: null,
      currentPeriodEnd: {
        gt: now,
        lte: new Date(now.getTime() + MEMBERSHIP_LIMITS.readinessDays * DAY_MS),
      },
    },
    take: BATCH,
    select: ROW_SELECT,
  });
  let reminded = 0;
  for (const row of rows) {
    const ready = await readyToRenew(contract, row.member as Address, row.pricePerPeriod).catch(
      () => true
    );
    if (ready) continue;
    const moved = await prisma.membership.updateMany({
      where: { id: Buffer.from(row.id), notReadyAt: null },
      data: { notReadyAt: now },
    });
    if (moved.count) {
      await remind(row, "not_ready", now);
      reminded += 1;
    }
  }
  return reminded;
}

/** Step 2: pause renewals for lapsed sellers, resume for sellers who pass again. */
export async function sellerPassOnce(now = new Date()): Promise<number> {
  const due = await prisma.membership.findMany({
    where: {
      status: { in: ["active", "past_due"] },
      currentPeriodEnd: { lte: new Date(now.getTime() + MEMBERSHIP_LIMITS.readinessDays * DAY_MS) },
    },
    take: BATCH,
    select: { id: true, creatorUserId: true, renewalPausedAt: true, currentPeriodEnd: true },
  });
  const verdicts = new Map<number, boolean>();
  let changed = 0;
  for (const row of due) {
    if (!row.creatorUserId) continue;
    if (!verdicts.has(row.creatorUserId)) {
      verdicts.set(row.creatorUserId, (await checkIdentity(row.creatorUserId, "seller")).pass);
    }
    const pass = verdicts.get(row.creatorUserId)!;
    if (!pass && !row.renewalPausedAt) {
      await prisma.membership.update({
        where: { id: Buffer.from(row.id) },
        data: { renewalPausedAt: now },
      });
      changed += 1;
    } else if (pass && row.renewalPausedAt) {
      await prisma.membership.update({
        where: { id: Buffer.from(row.id) },
        data: { renewalPausedAt: null },
      });
      changed += 1;
    } else if (!pass && row.currentPeriodEnd && row.currentPeriodEnd <= now) {
      // Members kept access to the period end; with the seller still lapsed, it ends there
      if (await endByPlatform(row.id, "seller_lapsed", now)) changed += 1;
    }
  }
  return changed;
}

/** Step 3: charge what is due. Reads the chain first so nothing is charged twice. */
export async function chargeOnce(contract: Address, now = new Date()): Promise<number> {
  const rows = await prisma.membership.findMany({
    where: {
      status: { in: ["active", "past_due"] },
      renewalPausedAt: null,
      currentPeriodEnd: {
        lte: now,
        gt: new Date(now.getTime() - MEMBERSHIP_LIMITS.graceDays * DAY_MS),
      },
    },
    orderBy: { currentPeriodEnd: "asc" },
    take: BATCH,
    select: ROW_SELECT,
  });
  let charged = 0;
  for (const row of rows) {
    const chain = await readSubscription(contract, row.id);
    if (!chain) continue;
    // Charged while we were away: apply it
    if (chain.charges > row.chargeCount) {
      await applyCharge(
        row.id,
        { charge: chain.charges, nextDue: chain.nextDue, txHash: null },
        now
      );
      charged += 1;
      continue;
    }
    if (!chain.active) {
      // Ended on chain outside this server (the member called cancel from their wallet, or
      // another instance's relayer ended it). Charges are already stopped: record it so
      // closeCanceledOnce ends the row at the period end instead of it reading active forever.
      await prisma.membership.updateMany({
        where: { id: Buffer.from(row.id), status: { in: ["active", "past_due"] } },
        data: { status: "canceled", canceledAt: now },
      });
      continue;
    }
    let txHash: Hex | null = null;
    let reverted = false;
    try {
      txHash = await getRelayer().call(
        contract,
        encodeFunctionData({
          abi: AMPEDMEMBERSHIPS_ABI,
          functionName: "renew",
          args: [membershipRef(row.id)],
        }),
        `renew:${hex(row.id)}:${row.chargeCount + 1}:${Math.floor(now.getTime() / 3_600_000)}`
      );
    } catch (error) {
      reverted = error instanceof RelayerError && error.code === "reverted";
      if (!reverted) continue; // the relayer is down: try next hour
    }
    if (txHash) {
      try {
        const receipt = await paymentClient().waitForTransactionReceipt({
          hash: txHash,
          timeout: 20_000,
        });
        if (receipt.status === "success") {
          const events = decodeMembershipLogs(receipt.logs, contract);
          const hit = events.find(e => e.kind === "membership_charged");
          if (hit && hit.kind === "membership_charged") {
            await applyCharge(row.id, { charge: hit.charge, nextDue: hit.nextDue, txHash }, now);
            await recordMembershipLogs(events, now, contract);
            charged += 1;
            continue;
          }
        }
        reverted = receipt.status !== "success";
      } catch {
        continue; // no receipt yet: the chain read settles it next hour
      }
    }
    if (reverted) {
      // Every instance in the hour sends the same idempotency key, and a renewal that lands
      // between our read and our call makes the contract refuse this period as not due. Read
      // once more before calling it a failure: a member who paid is never marked past due.
      const after = await readSubscription(contract, row.id);
      if (after && after.charges > row.chargeCount) {
        await applyCharge(row.id, { charge: after.charges, nextDue: after.nextDue, txHash }, now);
        charged += 1;
        continue;
      }
      if (row.status === "active") {
        await prisma.membership.updateMany({
          where: { id: Buffer.from(row.id), status: "active" },
          data: { status: "past_due", pastDueSince: row.currentPeriodEnd ?? now },
        });
      }
    }
  }
  return charged;
}

/** Step 4: grace reminders on day 1, 3 and 6, and the end after day 7. */
export async function graceOnce(now = new Date()): Promise<number> {
  const rows = await prisma.membership.findMany({
    where: { status: "past_due", pastDueSince: { not: null } },
    take: BATCH,
    select: ROW_SELECT,
  });
  let acted = 0;
  for (const row of rows) {
    const since = row.pastDueSince!;
    if (now.getTime() >= since.getTime() + MEMBERSHIP_LIMITS.graceDays * DAY_MS) {
      if (await endByPlatform(row.id, "past_due", now)) acted += 1;
      continue;
    }
    const day = graceDay(since, now);
    const due = [...MEMBERSHIP_LIMITS.reminderDays].filter(d => d <= day).pop();
    if (due && (row.lastReminderDay ?? 0) < due) {
      const moved = await prisma.membership.updateMany({
        where: {
          id: Buffer.from(row.id),
          OR: [{ lastReminderDay: null }, { lastReminderDay: { lt: due } }],
        },
        data: { lastReminderDay: due },
      });
      if (moved.count) {
        await remind(row, "past_due", now);
        acted += 1;
      }
    }
  }
  return acted;
}

/** Step 5: canceled memberships end when their period does. */
export async function closeCanceledOnce(now = new Date()): Promise<number> {
  const moved = await prisma.membership.updateMany({
    where: { status: "canceled", currentPeriodEnd: { lte: now } },
    data: { status: "ended", endedAt: now, endReason: "member_canceled" },
  });
  return moved.count;
}

/** One pass of every step. The checkout flag is read on every pass, so turning it off stops
 * charges and reminders without a restart. */
export async function runRenewalsOnce(now = new Date()) {
  const out = { ready: 0, seller: 0, charged: 0, grace: 0, closed: 0 };
  if (!isFeatureOn("checkout")) return out;
  const contract = ampedMembershipsAddress();
  out.closed = await closeCanceledOnce(now);
  if (!contract || !paymentsReady()) return out;
  out.seller = await sellerPassOnce(now);
  out.ready = await readinessOnce(contract, now);
  out.charged = await chargeOnce(contract, now);
  out.grace = await graceOnce(now);
  return out;
}

const RENEWALS_TICK_MS = 60 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let running = false;

/** Started from bootstrap.ts. No-op until AMPEDMEMBERSHIPS_ADDRESS is set. */
export function startMembershipRenewals() {
  if (!env.AMPEDMEMBERSHIPS_ADDRESS || timer || process.env.NODE_ENV === "test") return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const out = await runRenewalsOnce();
      if (Object.values(out).some(Boolean)) console.info("[memberships] renewals", out);
    } catch (error) {
      console.error("[memberships] renewals tick failed", error);
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => void tick(), RENEWALS_TICK_MS);
  timer.unref?.();
  void tick();
}

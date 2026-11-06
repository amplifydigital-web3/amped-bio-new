/**
 * Fan Library money (Build Board #26 and #25, FL-7, MB-3; spec 2.1 and 2.2 items 5 and 6,
 * decisions 2, 12 and 13; row 125, boards r1, mb-q1, mb-q1d; row 182 status sheet).
 *
 * - Memberships: one card per membership with the wallet's coverage of the next charge,
 *   read once per wallet (balance and the approval to AmpedMemberships), in the order of
 *   the next charge. A card claims nothing it could not read.
 * - The status sheet: the fan's membership with a creator, its receipts and the store
 *   policy at join, and every purchase from the creator with its receipt and policy.
 * - Labels: an item the fan can already open reads Purchased when a purchase covers it, or
 *   the plan name when it is in a product marked Also in membership and the fan is a member
 *   (precedence purchased, member, pool, follower, public; decision 12). Opening stays with
 *   the engine: a label never opens anything (G4 and G5 open paid and member items).
 *
 * No output carries a wallet address or an email.
 */
import { getAddress, isAddress, type Address } from "viem";
import { prisma } from "@repo/database";
import {
  LIBRARY_MEMBERSHIP_STATES,
  MEMBERSHIP_PERIOD_SECONDS,
  PURCHASE_ACCESS_STATUSES,
  graceDay,
  type LibraryAccessSource,
  type LibraryCreatorMoney,
  type LibraryMembershipCard,
  type LibraryMembershipState,
  type LibraryMembershipStatus,
  type LibraryPurchaseRow,
  type LibraryReceipt,
  type MembershipInterval,
} from "@repo/constants";
import { USDC_ALLOWANCE_ABI } from "@repo/web3";
import { getUsdcBalance, paymentClient, usdcAddress } from "../usdc/chain";
import { ampedMembershipsAddress } from "../payments/onchain";
import { accessUntil } from "../memberships/plans";
import { ownersFor } from "./library";

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");
/** Memberships the Library lists: current ones, and ended ones for 90 days (Rejoin). */
const LISTED = ["active", "past_due", "canceled", "ended"] as const;
const ENDED_SHOWN_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_ROWS = 100;
const RECEIPTS_MAX = 24;
const PURCHASES_MAX = 50;

type MembershipRow = Awaited<ReturnType<typeof membershipRows>>[number];

function membershipRows(fanUserId: number, creatorUserId?: number) {
  return prisma.membership.findMany({
    where: {
      fanUserId,
      status: { in: [...LISTED] },
      ...(creatorUserId !== undefined ? { creatorUserId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    include: { plan: { select: { name: true } } },
  });
}

/** The wallet's USDC and its approval to AmpedMemberships, or null when either read fails. */
export async function readCoverage(
  member: string
): Promise<{ balance: bigint; allowance: bigint } | null> {
  const contract = ampedMembershipsAddress();
  if (!contract || !isAddress(member, { strict: false })) return null;
  const owner = getAddress(member);
  try {
    const [balance, allowance] = await Promise.all([
      getUsdcBalance(owner),
      paymentClient().readContract({
        address: usdcAddress(),
        abi: USDC_ALLOWANCE_ABI,
        functionName: "allowance",
        args: [owner, contract as Address],
      }) as Promise<bigint>,
    ]);
    return { balance, allowance };
  } catch {
    return null;
  }
}

function baseStatus(row: MembershipRow, now: Date): LibraryMembershipStatus {
  const until = accessUntil(row, now);
  const state: LibraryMembershipState =
    row.status === "past_due"
      ? "past_due"
      : row.status === "canceled"
        ? until
          ? "ends"
          : "ended"
        : row.status === "ended"
          ? "ended"
          : row.renewalPausedAt
            ? "renewal_paused"
            : "active";
  return {
    id: hex(row.id),
    planName: row.plan.name,
    state,
    accessUntil: until?.toISOString() ?? null,
    nextChargeAt:
      row.status === "active" && !row.renewalPausedAt
        ? (row.currentPeriodEnd?.toISOString() ?? null)
        : null,
    graceDay:
      row.status === "past_due" && row.pastDueSince ? graceDay(row.pastDueSince, now) : null,
  };
}

/**
 * Cards for the given rows. Charges are matched against the wallet in the order they fall
 * due, so two memberships never both claim the same USDC (spec 2.2 item 6).
 */
async function cardsFor(rows: MembershipRow[], now: Date): Promise<LibraryMembershipCard[]> {
  const shown = rows.filter(
    row =>
      row.status !== "ended" ||
      (row.endedAt ?? row.updatedAt).getTime() > now.getTime() - ENDED_SHOWN_MS
  );
  if (!shown.length) return [];
  const [owners, policies] = await Promise.all([
    ownersFor(shown.map(row => row.creatorUserId).filter((id): id is number => id !== null)),
    prisma.storePolicyVersion.findMany({
      where: {
        id: {
          in: shown
            .map(row => row.storePolicyVersionId)
            .filter((id): id is Uint8Array => !!id)
            .map(id => Buffer.from(id)),
        },
      },
      select: { id: true, version: true },
    }),
  ]);
  const policyVersion = new Map(policies.map(p => [hex(p.id), p.version]));

  // One read per wallet; the same wallet pays every membership the fan holds
  const wallets = [...new Set(shown.filter(chargeable).map(row => row.member.toLowerCase()))];
  const coverage = new Map(
    await Promise.all(wallets.map(async w => [w, await readCoverage(w)] as const))
  );
  const left = new Map(
    [...coverage].map(([w, c]) => [w, c ? { balance: c.balance, allowance: c.allowance } : null])
  );

  const cards = new Map<string, LibraryMembershipCard>();
  const byDue = [...shown].sort(
    (a, b) => dueAt(a).getTime() - dueAt(b).getTime() || hex(a.id).localeCompare(hex(b.id))
  );
  for (const row of byDue) {
    const base = baseStatus(row, now);
    const owner = row.creatorUserId !== null ? owners.get(row.creatorUserId)?.owner : undefined;
    if (!owner?.handle) continue;
    const price = row.pricePerPeriod;
    let state = base.state;
    let coveredThrough: string | null = null;
    let need: bigint | null = null;
    let allowanceShort = false;
    let chargesLeft: number | null = null;
    const wallet = left.get(row.member.toLowerCase());
    if (chargeable(row) && wallet) {
      chargesLeft = price > 0n ? Number(wallet.allowance / price) : null;
      const covered = wallet.balance >= price && wallet.allowance >= price;
      if (covered) {
        wallet.balance -= price;
        wallet.allowance -= price;
        if (state === "active") {
          state = "covered";
          const due = dueAt(row);
          coveredThrough = new Date(
            due.getTime() + MEMBERSHIP_PERIOD_SECONDS[row.interval as MembershipInterval] * 1000
          ).toISOString();
        }
      } else {
        const short = price > wallet.balance ? price - wallet.balance : 0n;
        need = short > 0n ? short : null;
        allowanceShort = wallet.allowance < price;
        // Spend what there is, so a later charge does not count it twice
        wallet.balance = wallet.balance > price ? wallet.balance - price : 0n;
        if (state === "active") state = "not_covered";
      }
    } else if (row.status === "past_due") {
      need = price;
    }
    cards.set(hex(row.id), {
      ...base,
      state,
      owner,
      interval: row.interval as MembershipInterval,
      amount: price.toString(),
      coveredThrough,
      need: need !== null ? need.toString() : null,
      allowanceShort,
      chargesLeft,
      storePolicyVersion: row.storePolicyVersionId
        ? (policyVersion.get(hex(row.storePolicyVersionId)) ?? null)
        : null,
      joinedAt: row.createdAt.toISOString(),
    });
  }
  const order = (state: LibraryMembershipState) => LIBRARY_MEMBERSHIP_STATES.indexOf(state);
  return shown
    .map(row => cards.get(hex(row.id)))
    .filter((card): card is LibraryMembershipCard => !!card)
    .sort(
      (a, b) =>
        order(a.state) - order(b.state) ||
        (a.nextChargeAt ?? a.accessUntil ?? "").localeCompare(b.nextChargeAt ?? b.accessUntil ?? "")
    );
}

/** Charges still to come: active (not paused) and past due. */
function chargeable(row: MembershipRow) {
  return (row.status === "active" && !row.renewalPausedAt) || row.status === "past_due";
}

function dueAt(row: MembershipRow): Date {
  if (row.status === "past_due" && row.pastDueSince) return row.pastDueSince;
  return row.currentPeriodEnd ?? row.createdAt;
}

/** library.memberships: every card, most urgent first. */
export async function libraryMemberships(
  fanUserId: number,
  now = new Date()
): Promise<LibraryMembershipCard[]> {
  return cardsFor(await membershipRows(fanUserId), now);
}

/** Membership charges of one membership the fan holds, newest first. */
async function receiptsFor(fanUserId: number, membershipId: Uint8Array): Promise<LibraryReceipt[]> {
  const rows = await prisma.paymentEvent.findMany({
    where: {
      kind: "membership_charged",
      refType: "membership",
      refId: Buffer.from(membershipId),
      payerUserId: fanUserId,
    },
    orderBy: { occurredAt: "desc" },
    take: RECEIPTS_MAX,
    select: { occurredAt: true, amount: true, txHash: true },
  });
  return rows.map(row => ({
    at: row.occurredAt.toISOString(),
    amount: row.amount.toString(),
    txHash: row.txHash,
  }));
}

/** library.membership: one card with its receipts, for the Manage sheet. Null when not the fan's. */
export async function libraryMembership(
  fanUserId: number,
  membershipId: string,
  now = new Date()
): Promise<{ card: LibraryMembershipCard; receipts: LibraryReceipt[] } | null> {
  const row = await prisma.membership.findUnique({
    where: { id: Buffer.from(membershipId, "hex") },
    select: { fanUserId: true, creatorUserId: true },
  });
  if (!row || row.fanUserId !== fanUserId) return null;
  const all = await cardsFor(await membershipRows(fanUserId), now);
  const card = all.find(c => c.id === membershipId);
  if (!card) return null;
  return { card, receipts: await receiptsFor(fanUserId, Buffer.from(membershipId, "hex")) };
}

function purchaseState(status: string): LibraryPurchaseRow["state"] {
  if (status === "refunded") return "refunded";
  return status === "confirmed" ? "final" : "pending";
}

/** The fan's paid purchases from one creator, newest first, with the policy they were shown. */
async function purchasesFrom(fanUserId: number, creatorUserId: number) {
  const rows = await prisma.purchase.findMany({
    where: {
      buyerUserId: fanUserId,
      creatorUserId,
      status: { in: [...PURCHASE_ACCESS_STATUSES, "refunded"] },
    },
    orderBy: { createdAt: "desc" },
    take: PURCHASES_MAX,
    select: {
      id: true,
      targetType: true,
      targetId: true,
      offerId: true,
      amount: true,
      status: true,
      txHash: true,
      softConfirmedAt: true,
      confirmedAt: true,
      createdAt: true,
      accessUntil: true,
      storePolicyVersionId: true,
    },
  });
  const offerIds = rows.map(r => r.offerId).filter((id): id is Uint8Array => !!id);
  const itemIds = rows.filter(r => r.targetType === "content").map(r => r.targetId);
  const policyIds = rows
    .map(r => r.storePolicyVersionId)
    .filter((id): id is Uint8Array => !!id)
    .map(id => Buffer.from(id));
  // Empty lists match nothing, so the three reads need no guard
  const [offers, items, policies] = await Promise.all([
    prisma.offer.findMany({
      where: { id: { in: offerIds.map(id => Buffer.from(id)) } },
      select: { id: true, title: true },
    }),
    prisma.contentItem.findMany({
      where: { publicId: { in: itemIds } },
      select: { publicId: true, title: true },
    }),
    prisma.storePolicyVersion.findMany({
      where: { id: { in: policyIds } },
      select: { id: true, version: true },
    }),
  ]);
  const offerTitle = new Map<string, string>(offers.map(o => [hex(o.id), o.title]));
  const itemTitle = new Map<string, string>(items.map(i => [i.publicId, i.title]));
  const policyVersion = new Map<string, number>(policies.map(p => [hex(p.id), p.version]));
  return rows.map(
    (row): LibraryPurchaseRow => ({
      id: hex(row.id),
      title:
        (row.offerId ? offerTitle.get(hex(row.offerId)) : itemTitle.get(row.targetId)) ??
        "Removed item",
      amount: row.amount.toString(),
      at: (row.softConfirmedAt ?? row.confirmedAt ?? row.createdAt).toISOString(),
      state: purchaseState(row.status),
      txHash: row.txHash,
      storePolicyVersion: row.storePolicyVersionId
        ? (policyVersion.get(hex(row.storePolicyVersionId)) ?? null)
        : null,
      accessUntil: row.accessUntil?.toISOString() ?? null,
    })
  );
}

/** library.creatorMoney: the status sheet's membership, receipts and purchases (row 182). */
export async function libraryCreatorMoney(
  fanUserId: number,
  creatorUserId: number,
  now = new Date()
): Promise<LibraryCreatorMoney> {
  const [rows, purchases] = await Promise.all([
    membershipRows(fanUserId, creatorUserId),
    purchasesFrom(fanUserId, creatorUserId),
  ]);
  const cards = await cardsFor(rows, now);
  // The current membership first; an ended one only when there is nothing current
  const membership = cards.find(c => c.state !== "ended") ?? cards[0] ?? null;
  return {
    membership,
    receipts: membership ? await receiptsFor(fanUserId, Buffer.from(membership.id, "hex")) : [],
    purchases,
  };
}

/**
 * The section header's money parts, in four small reads: the newest membership's status,
 * the purchase count and the creator's plan when it takes members.
 */
export async function creatorMoneyStatus(
  fanUserId: number,
  creatorUserId: number,
  now = new Date()
): Promise<{
  membership: LibraryMembershipStatus | null;
  purchases: number;
  plan: { name: string; amountEvery30Days: string } | null;
}> {
  const [rows, purchases, plan] = await Promise.all([
    membershipRows(fanUserId, creatorUserId),
    prisma.purchase.count({
      where: {
        buyerUserId: fanUserId,
        creatorUserId,
        status: { in: [...PURCHASE_ACCESS_STATUSES] },
      },
    }),
    prisma.membershipPlan.findUnique({
      where: { creatorUserId },
      select: { name: true, status: true, amountEvery30Days: true },
    }),
  ]);
  const statuses = rows.map(row => baseStatus(row, now));
  const membership = statuses.find(s => s.state !== "ended") ?? statuses[0] ?? null;
  return {
    membership,
    purchases,
    plan:
      plan && plan.status === "active"
        ? { name: plan.name, amountEvery30Days: plan.amountEvery30Days.toString() }
        : null,
  };
}

/** Creators the fan holds a current membership with, and those they bought from. */
export async function moneyCreatorIds(
  fanUserId: number,
  now = new Date()
): Promise<{ members: Set<number>; purchased: Map<number, number>; pastDue: Set<number> }> {
  const [memberships, purchases] = await Promise.all([
    prisma.membership.findMany({
      where: { fanUserId, status: { in: ["active", "past_due", "canceled"] } },
      select: {
        creatorUserId: true,
        status: true,
        currentPeriodEnd: true,
        pastDueSince: true,
      },
    }),
    prisma.purchase.groupBy({
      by: ["creatorUserId"],
      where: { buyerUserId: fanUserId, status: { in: [...PURCHASE_ACCESS_STATUSES] } },
      _count: { _all: true },
    }),
  ]);
  const members = new Set<number>();
  const pastDue = new Set<number>();
  for (const m of memberships) {
    if (m.creatorUserId === null || !accessUntil(m, now)) continue;
    members.add(m.creatorUserId);
    if (m.status === "past_due") pastDue.add(m.creatorUserId);
  }
  const purchased = new Map<number, number>();
  for (const p of purchases) {
    if (p.creatorUserId !== null) purchased.set(p.creatorUserId, p._count._all);
  }
  return { members, purchased, pastDue };
}

/**
 * Labels for items the fan can already open: Purchased when a current purchase covers the
 * item (a single content item or a product holding it), else the plan name when the fan is
 * a member and the item is in a product marked Also in membership. Keyed by publicId.
 */
export async function moneyLabels(
  fanUserId: number,
  items: Array<{ id: Uint8Array; publicId: string; userId: number }>,
  now = new Date()
): Promise<Map<string, { source: LibraryAccessSource; planName: string | null }>> {
  const out = new Map<string, { source: LibraryAccessSource; planName: string | null }>();
  if (!items.length) return out;
  const ids = items.map(item => Buffer.from(item.id));
  const creatorIds = [...new Set(items.map(item => item.userId))];
  const [offerItems, purchases, memberships] = await Promise.all([
    prisma.offerItem.findMany({
      where: { contentItemId: { in: ids } },
      select: {
        contentItemId: true,
        offerId: true,
        offer: { select: { alsoInMembership: true, creatorUserId: true } },
      },
    }),
    prisma.purchase.findMany({
      where: {
        buyerUserId: fanUserId,
        creatorUserId: { in: creatorIds },
        status: { in: [...PURCHASE_ACCESS_STATUSES] },
        OR: [{ accessUntil: null }, { accessUntil: { gt: now } }],
      },
      select: { targetType: true, targetId: true, offerId: true },
    }),
    prisma.membership.findMany({
      where: {
        fanUserId,
        creatorUserId: { in: creatorIds },
        status: { in: ["active", "past_due", "canceled"] },
      },
      select: {
        creatorUserId: true,
        status: true,
        currentPeriodEnd: true,
        pastDueSince: true,
        plan: { select: { name: true } },
      },
    }),
  ]);
  const boughtOffers = new Set(
    purchases.map(p => (p.offerId ? hex(p.offerId) : null)).filter((id): id is string => !!id)
  );
  const boughtItems = new Set(
    purchases.filter(p => p.targetType === "content").map(p => p.targetId)
  );
  const planOf = new Map<number, string>();
  for (const m of memberships) {
    if (m.creatorUserId !== null && accessUntil(m, now)) planOf.set(m.creatorUserId, m.plan.name);
  }
  const offersOf = new Map<string, Array<{ offerId: string; member: boolean }>>();
  for (const row of offerItems) {
    const key = hex(row.contentItemId);
    const list = offersOf.get(key) ?? [];
    list.push({ offerId: hex(row.offerId), member: row.offer.alsoInMembership });
    offersOf.set(key, list);
  }
  for (const item of items) {
    const offers = offersOf.get(hex(item.id)) ?? [];
    if (boughtItems.has(item.publicId) || offers.some(o => boughtOffers.has(o.offerId))) {
      out.set(item.publicId, { source: "purchased", planName: null });
      continue;
    }
    const plan = planOf.get(item.userId);
    if (plan && offers.some(o => o.member)) {
      out.set(item.publicId, { source: "member", planName: plan });
    }
  }
  return out;
}

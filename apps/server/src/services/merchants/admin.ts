import { getAddress, isAddress } from "viem";
import { prisma, type Prisma } from "@repo/database";
import {
  AMPEDPAY_CONTRACT,
  DEFAULT_MERCHANT_FEE_BPS,
  MERCHANT_ROLES,
  type MerchantRole,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { recordMerchantAudit } from "./audit";

/**
 * Admin, Money, Merchants (board a1; docs/features/authbase-storefront.md 3.2 and 3.8).
 *
 * Creating a merchant, adding members and recording the business check need one admin: a
 * pending merchant cannot sell. Turning a merchant on or off and changing its fee follow the
 * two person rule of the payments settings (AmpedPay spec 3.5): one payments admin drafts with a
 * reason, a different payments admin approves, and only then does it apply. The rows live in
 * admin_changes with area "merchants", so the payments change log shows them too.
 */

export class MerchantAdminError extends Error {}

const AREA = "merchants";
const OPEN = ["draft"];

export type BusinessCheck = {
  registration: boolean;
  beneficialOwners: boolean;
  sanctionsScreen: boolean;
  notes?: string;
  checkedById?: number;
  checkedAt?: string;
};

export function businessCheckComplete(check: unknown): boolean {
  const c = (check ?? {}) as Partial<BusinessCheck>;
  return c.registration === true && c.beneficialOwners === true && c.sanctionsScreen === true;
}

function changeKey(merchantId: Buffer, field: "status" | "fee_bps") {
  return `merchant:${merchantId.toString("hex")}:${field}`;
}

export async function createMerchant(input: { userId: number; slug: string; name: string }) {
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
    throw new MerchantAdminError("Use 3 to 40 lowercase letters, numbers or hyphens.");
  }
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new MerchantAdminError("Enter the business name.");
  const exists = await prisma.merchant.findUnique({ where: { slug }, select: { id: true } });
  if (exists) throw new MerchantAdminError("A merchant with this slug exists.");
  const id = uuidv7();
  await prisma.merchant.create({
    data: { id, slug, name, status: "pending", feeBps: DEFAULT_MERCHANT_FEE_BPS, createdById: input.userId },
  });
  await recordMerchantAudit(id, input.userId, "merchant.created", { slug, name });
  return { id: id.toString("hex") };
}

export async function addMerchantMember(input: {
  adminUserId: number;
  merchantId: Buffer;
  userId: number;
  role: MerchantRole;
}) {
  if (!MERCHANT_ROLES.includes(input.role)) throw new MerchantAdminError("Unknown role.");
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) throw new MerchantAdminError("No Amped.Bio account with that id.");
  await prisma.merchantMember.upsert({
    where: { merchantId_userId: { merchantId: input.merchantId, userId: input.userId } },
    create: {
      id: uuidv7(),
      merchantId: input.merchantId,
      userId: input.userId,
      role: input.role,
      addedById: input.adminUserId,
    },
    update: { role: input.role },
  });
  await recordMerchantAudit(input.merchantId, input.adminUserId, "member.set", {
    userId: input.userId,
    role: input.role,
  });
}

export async function recordBusinessCheck(input: {
  adminUserId: number;
  merchantId: Buffer;
  check: Omit<BusinessCheck, "checkedById" | "checkedAt">;
  now?: Date;
}) {
  const check: BusinessCheck = {
    ...input.check,
    checkedById: input.adminUserId,
    checkedAt: (input.now ?? new Date()).toISOString(),
  };
  await prisma.merchant.update({
    where: { id: input.merchantId },
    data: { businessCheck: check as unknown as Prisma.InputJsonValue },
  });
  await recordMerchantAudit(input.merchantId, input.adminUserId, "business_check.recorded", {
    registration: check.registration,
    beneficialOwners: check.beneficialOwners,
    sanctionsScreen: check.sanctionsScreen,
  });
}

/** Drafts turning a merchant on (active) or off (suspended), or a new fee in bps. */
export async function draftMerchantChange(input: {
  userId: number;
  merchantId: Buffer;
  field: "status" | "fee_bps";
  newValue: string;
  reason: string;
  now?: Date;
}) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new MerchantAdminError("Give a reason the second admin can check.");
  const merchant = await prisma.merchant.findUnique({ where: { id: input.merchantId } });
  if (!merchant) throw new MerchantAdminError("Merchant not found.");
  const oldValue = input.field === "status" ? merchant.status : String(merchant.feeBps);
  const newValue = validateValue(input.field, input.newValue.trim(), merchant.businessCheck);
  if (newValue === oldValue) throw new MerchantAdminError("The new value is the same as the current one.");
  const key = changeKey(input.merchantId, input.field);
  const waiting = await prisma.adminChange.findFirst({
    where: { area: AREA, key, status: { in: OPEN } },
    select: { id: true },
  });
  if (waiting) throw new MerchantAdminError("A change to this value is already waiting.");
  return prisma.adminChange.create({
    data: {
      id: uuidv7(),
      area: AREA,
      target: "server",
      key,
      oldValue,
      newValue,
      effectiveAt: null,
      reason,
      status: "draft",
      draftedById: input.userId,
      createdAt: input.now ?? new Date(),
    },
  });
}

function validateValue(field: "status" | "fee_bps", value: string, businessCheck: unknown) {
  if (field === "status") {
    if (value !== "active" && value !== "suspended") {
      throw new MerchantAdminError("Status is active or suspended.");
    }
    if (value === "active" && !businessCheckComplete(businessCheck)) {
      throw new MerchantAdminError(
        "Record the business check first: registration, beneficial owners and sanctions screen."
      );
    }
    return value;
  }
  if (!/^\d{1,5}$/.test(value)) throw new MerchantAdminError("Fee is a whole number of basis points.");
  const bps = Number(value);
  if (bps < AMPEDPAY_CONTRACT.defaults.feeFloorBps || bps > AMPEDPAY_CONTRACT.MAX_MERCHANT_FEE_BPS) {
    throw new MerchantAdminError(
      `Fee must be between ${AMPEDPAY_CONTRACT.defaults.feeFloorBps} and ${AMPEDPAY_CONTRACT.MAX_MERCHANT_FEE_BPS} bps.`
    );
  }
  return String(bps);
}

/** The second admin approves. The drafter is refused. Applies at once. */
export async function approveMerchantChange(input: {
  userId: number;
  changeId: Buffer;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const outcome = await prisma.$transaction(async tx => {
    const change = await tx.adminChange.findUnique({ where: { id: input.changeId } });
    if (!change || change.area !== AREA) throw new MerchantAdminError("Change not found.");
    if (change.status !== "draft") throw new MerchantAdminError("This change is no longer open.");
    if (change.draftedById === input.userId) {
      throw new MerchantAdminError("A different admin must approve this change.");
    }
    const [, idHex, field] = change.key.split(":");
    const merchantId = Buffer.from(idHex!, "hex");
    const merchant = await tx.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new MerchantAdminError("Merchant not found.");
    // A stale draft is closed, not left open: otherwise it would block every new draft for
    // this field. The transaction commits the supersede and the caller throws after it.
    const supersede = () =>
      tx.adminChange.updateMany({
        where: { id: change.id, status: "draft" },
        data: { status: "superseded", decidedAt: now },
      });
    const current = field === "status" ? merchant.status : String(merchant.feeBps);
    if (current !== change.oldValue) {
      await supersede();
      return { stale: true as const };
    }
    const value = validateValue(field as "status" | "fee_bps", change.newValue, merchant.businessCheck);
    // Conditional on the old value: two approvals racing on the same draft apply once, and a
    // draft never overwrites a value another admin changed in the meantime
    const written = await tx.merchant.updateMany({
      where:
        field === "status"
          ? { id: merchantId, status: change.oldValue }
          : { id: merchantId, feeBps: Number(change.oldValue) },
      data:
        field === "status"
          ? value === "active"
            ? { status: "active", approvedAt: merchant.approvedAt ?? now, suspendedAt: null }
            : { status: "suspended", suspendedAt: now }
          : { feeBps: Number(value) },
    });
    if (written.count !== 1) {
      await supersede();
      return { stale: true as const };
    }
    const marked = await tx.adminChange.updateMany({
      where: { id: change.id, status: "draft" },
      data: { status: "applied", approvedById: input.userId, decidedAt: now, appliedAt: now },
    });
    // Another approval won the draft between the read and this write: roll back and refuse
    if (marked.count !== 1) throw new MerchantAdminError("This change is no longer open.");
    await recordMerchantAudit(
      merchantId,
      input.userId,
      field === "status" ? `merchant.${value}` : "merchant.fee_changed",
      { from: change.oldValue, to: value, draftedBy: change.draftedById },
      tx
    );
    return { stale: false as const, field, value };
  });
  if (outcome.stale) {
    throw new MerchantAdminError("The value changed since the draft. Draft it again.");
  }
  return { field: outcome.field, value: outcome.value };
}

export async function rejectMerchantChange(input: { userId: number; changeId: Buffer; note: string }) {
  const updated = await prisma.adminChange.updateMany({
    where: { id: input.changeId, area: AREA, status: "draft" },
    data: {
      status: "rejected",
      rejectedById: input.userId,
      decisionNote: input.note.trim().slice(0, 500),
      decidedAt: new Date(),
    },
  });
  if (updated.count !== 1) throw new MerchantAdminError("This change is no longer open.");
}

export async function listMerchants() {
  const rows = await prisma.merchant.findMany({
    orderBy: { createdAt: "desc" },
    include: { members: { select: { userId: true, role: true } } },
  });
  // One query for every effective wallet: the list can hold every merchant, so no N+1 here
  const wallets = rows.length
    ? await prisma.merchantPayoutWallet.findMany({
        where: {
          merchantId: { in: rows.map(m => Buffer.from(m.id)) },
          status: "effective",
        },
        orderBy: { effectiveAt: "desc" },
        select: { merchantId: true, address: true },
      })
    : [];
  const effective = new Map<string, string>();
  for (const wallet of wallets) {
    const key = Buffer.from(wallet.merchantId).toString("hex");
    if (!effective.has(key) && isAddress(wallet.address, { strict: false })) {
      effective.set(key, getAddress(wallet.address));
    }
  }
  return rows.map(m => ({
    id: Buffer.from(m.id).toString("hex"),
    slug: m.slug,
    name: m.name,
    status: m.status,
    feeBps: m.feeBps,
    businessCheckComplete: businessCheckComplete(m.businessCheck),
    payoutWallet: effective.get(Buffer.from(m.id).toString("hex")) ?? null,
    members: m.members,
    approvedAt: m.approvedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function merchantDetail(merchantId: Buffer) {
  const m = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: {
      members: true,
      payoutWallets: { orderBy: { createdAt: "desc" }, take: 20 },
      auditLog: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!m) throw new MerchantAdminError("Merchant not found.");
  const changes = await prisma.adminChange.findMany({
    where: { area: AREA, key: { startsWith: `merchant:${merchantId.toString("hex")}:` } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return {
    id: merchantId.toString("hex"),
    slug: m.slug,
    name: m.name,
    status: m.status,
    feeBps: m.feeBps,
    businessCheck: (m.businessCheck ?? null) as BusinessCheck | null,
    storePolicyUrl: m.storePolicyUrl,
    returnUrl: m.returnUrl,
    members: m.members.map(x => ({ userId: x.userId, role: x.role })),
    payoutWallets: m.payoutWallets.map(w => ({
      id: Buffer.from(w.id).toString("hex"),
      address: w.address,
      status: w.status,
      proposedById: w.proposedById,
      approvedById: w.approvedById,
      effectiveAt: w.effectiveAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
    })),
    changes: changes.map(c => ({
      id: Buffer.from(c.id).toString("hex"),
      field: c.key.split(":")[2],
      oldValue: c.oldValue,
      newValue: c.newValue,
      reason: c.reason,
      status: c.status,
      draftedById: c.draftedById,
      approvedById: c.approvedById,
      createdAt: c.createdAt.toISOString(),
    })),
    audit: m.auditLog.map(a => ({
      actorId: a.actorId,
      action: a.action,
      // Flat values only, so the admin types stay shallow
      detail: (a.detail ?? null) as Record<string, string | number | boolean | null> | null,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

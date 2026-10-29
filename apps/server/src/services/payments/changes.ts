import { prisma } from "@repo/database";
import {
  ADMIN_CHANGE_DRAFT_TTL_MS,
  PAYMENT_ITEMS,
  PAYMENT_ITEM_BY_ID,
  formatPaymentValue,
  type AdminChangeStatus,
  type PaymentItem,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import {
  PaymentSettingError,
  checkEffectiveAt,
  clearPaymentSettingsCache,
  contractLimits,
  contractValues,
  itemRows,
  paymentSettings,
  validateServerValue,
  valueType,
} from "./settings";

/**
 * The two person rule for payments settings (spec 3.5, decision 1). A payments_admin
 * drafts a change with a reason; a different payments_admin approves it; only then does it
 * apply. Pause applies at once by one payments_admin with a reason; Resume follows the rule.
 * Drafts expire after 7 days. Every row is the change log: never deleted, never edited
 * after it applies.
 *
 * On chain values change through the Safe (spec 3.6). PAY-A1 shows them read only; PAY-A2
 * adds the Safe delegate proposal.
 */

export class AdminChangeError extends Error {}

const AREA = "payments";
const OPEN: AdminChangeStatus[] = ["draft", "approved", "proposed"];

export type ChangeFilter = "all" | "waiting" | "applied" | "closed";

const FILTER_STATUSES: Record<Exclude<ChangeFilter, "all">, AdminChangeStatus[]> = {
  waiting: ["draft", "approved", "proposed"],
  applied: ["applied"],
  closed: ["rejected", "expired", "superseded"],
};

/** Drafts older than 7 days read Expired (spec 3.5). Runs before every list and decision. */
export async function expireStaleDrafts(now = new Date()): Promise<number> {
  const result = await prisma.adminChange.updateMany({
    where: {
      area: AREA,
      status: "draft",
      createdAt: { lt: new Date(now.getTime() - ADMIN_CHANGE_DRAFT_TTL_MS) },
    },
    data: { status: "expired", decidedAt: now },
  });
  return result.count;
}

async function knownHandles(value: string): Promise<Set<string>> {
  const handles = value
    .split(/[\s,]+/)
    .map(handle => handle.replace(/^@/, "").toLowerCase())
    .filter(Boolean);
  if (handles.length === 0) return new Set();
  const users = await prisma.user.findMany({
    where: { handle: { in: handles } },
    select: { handle: true },
  });
  return new Set(users.map(user => (user.handle ?? "").toLowerCase()));
}

function requireServerItem(itemId: string): PaymentItem {
  const item = PAYMENT_ITEM_BY_ID[itemId];
  if (!item) throw new AdminChangeError("That setting does not exist.");
  if (item.target === "fixed") {
    throw new AdminChangeError("This value is fixed in the audited contract and cannot change.");
  }
  if (item.target === "contract") {
    throw new AdminChangeError(
      "On chain values change through the Safe. That flow ships with PAY-A2."
    );
  }
  return item;
}

export interface DraftInput {
  userId: number;
  itemId: string;
  newValue: string;
  reason: string;
  effectiveAt?: Date | null;
  now?: Date;
}

/** Drafts a server change (spec 3.6 step 1 for server values). */
export async function draftChange(input: DraftInput) {
  const now = input.now ?? new Date();
  const item = requireServerItem(input.itemId);
  if (item.id === "payments_paused" && input.newValue.trim() !== "false") {
    throw new AdminChangeError("Pause applies at once from Overview. Only Resume is drafted.");
  }
  const reason = input.reason.trim();
  if (reason.length < 3) throw new AdminChangeError("Give a reason the second admin can check.");

  await expireStaleDrafts(now);
  const waiting = await prisma.adminChange.findFirst({
    where: { area: AREA, key: item.id, status: { in: OPEN } },
    select: { id: true },
  });
  if (waiting) {
    throw new AdminChangeError(
      "A change to this value is already waiting. Approve, reject or let it expire first."
    );
  }

  clearPaymentSettingsCache();
  const settings = await paymentSettings(now.getTime());
  const oldValue = settings.values[item.id] ?? "";
  let newValue: string;
  let effectiveAt: Date | null;
  try {
    newValue = validateServerValue(item.id, input.newValue, {
      values: settings.values,
      limits: contractLimits(),
      knownHandles: item.kind === "handles" ? await knownHandles(input.newValue) : undefined,
      now,
    });
    effectiveAt = checkEffectiveAt(item.id, oldValue, newValue, input.effectiveAt ?? null, now);
  } catch (error) {
    if (error instanceof PaymentSettingError) throw new AdminChangeError(error.message);
    throw error;
  }
  if (newValue === oldValue)
    throw new AdminChangeError("The new value is the same as the current one.");

  return prisma.adminChange.create({
    data: {
      id: uuidv7(),
      area: AREA,
      target: "server",
      key: item.id,
      oldValue,
      newValue,
      effectiveAt,
      reason,
      status: "draft",
      draftedById: input.userId,
      createdAt: now,
    },
  });
}

async function writeItem(
  tx: Pick<typeof prisma, "siteSettings">,
  item: PaymentItem,
  value: string
) {
  for (const row of itemRows(item, value)) {
    await tx.siteSettings.upsert({
      where: { setting_key: row.key },
      create: { setting_key: row.key, setting_value: row.value, value_type: valueType(item) },
      update: { setting_value: row.value, value_type: valueType(item) },
    });
  }
}

/**
 * The second payments_admin approves (spec 3.5, acceptance 4). The drafter is refused. The
 * value is checked again against today's settings; if it changed since the draft, the
 * draft is superseded. A fee with a future date is held as approved and applied on that
 * date; everything else applies in the same transaction as the status change.
 */
export async function approveChange({
  userId,
  changeId,
  now = new Date(),
}: {
  userId: number;
  changeId: Buffer;
  now?: Date;
}) {
  await expireStaleDrafts(now);
  const change = await prisma.adminChange.findUnique({ where: { id: changeId } });
  if (!change || change.area !== AREA) throw new AdminChangeError("That change does not exist.");
  if (change.status !== "draft") {
    throw new AdminChangeError(`This change is ${change.status} and cannot be approved.`);
  }
  if (change.draftedById === userId) {
    throw new AdminChangeError("You drafted this change. A different payments admin approves it.");
  }
  const item = requireServerItem(change.key);

  clearPaymentSettingsCache();
  const settings = await paymentSettings(now.getTime());
  const current = settings.values[item.id] ?? "";
  if (current !== change.oldValue) {
    await prisma.adminChange.updateMany({
      where: { id: changeId, status: "draft" },
      data: { status: "superseded", decidedAt: now },
    });
    throw new AdminChangeError(
      "This value changed since the draft. Draft it again from the current value."
    );
  }
  try {
    validateServerValue(item.id, change.newValue, {
      values: settings.values,
      limits: contractLimits(),
      knownHandles: item.kind === "handles" ? await knownHandles(change.newValue) : undefined,
      now,
    });
  } catch (error) {
    if (error instanceof PaymentSettingError) throw new AdminChangeError(error.message);
    throw error;
  }

  const scheduled = change.effectiveAt !== null && change.effectiveAt.getTime() > now.getTime();
  const result = await prisma.$transaction(async tx => {
    const claimed = await tx.adminChange.updateMany({
      where: { id: changeId, status: "draft" },
      data: scheduled
        ? { status: "approved", approvedById: userId, decidedAt: now }
        : { status: "applied", approvedById: userId, decidedAt: now, appliedAt: now },
    });
    if (claimed.count === 0) return false;
    if (!scheduled) await writeItem(tx, item, change.newValue);
    return true;
  });
  if (!result) throw new AdminChangeError("Another admin decided this change first.");
  clearPaymentSettingsCache();
  return { status: scheduled ? ("approved" as const) : ("applied" as const) };
}

/** Rejects a waiting draft with a note. Any payments_admin, including the drafter withdrawing it. */
export async function rejectChange({
  userId,
  changeId,
  note,
  now = new Date(),
}: {
  userId: number;
  changeId: Buffer;
  note: string;
  now?: Date;
}) {
  const text = note.trim();
  if (text.length < 3) throw new AdminChangeError("Say why, so the drafter knows what to fix.");
  await expireStaleDrafts(now);
  const result = await prisma.adminChange.updateMany({
    where: { id: changeId, area: AREA, status: { in: ["draft", "approved"] } },
    data: { status: "rejected", approvedById: userId, decisionNote: text, decidedAt: now },
  });
  if (result.count === 0) throw new AdminChangeError("This change is no longer waiting.");
  return { status: "rejected" as const };
}

/**
 * Pause payments on the server at once (spec 3.5 exception, acceptance 6). One
 * payments_admin, a reason and two factor. Logged as an applied change that needed no
 * second admin. Resume is drafted and approved like any other change.
 */
export async function pausePayments({
  userId,
  reason,
  now = new Date(),
}: {
  userId: number;
  reason: string;
  now?: Date;
}) {
  const text = reason.trim();
  if (text.length < 3) throw new AdminChangeError("Give a reason for the pause.");
  const item = PAYMENT_ITEM_BY_ID["payments_paused"]!;
  clearPaymentSettingsCache();
  const settings = await paymentSettings(now.getTime());
  if (settings.paymentsPaused) throw new AdminChangeError("Payments are already paused.");

  await prisma.$transaction(async tx => {
    await tx.adminChange.create({
      data: {
        id: uuidv7(),
        area: AREA,
        target: "server",
        key: item.id,
        oldValue: "false",
        newValue: "true",
        reason: text,
        status: "applied",
        draftedById: userId,
        decisionNote: "Pause applies at once. Resume needs a second payments admin.",
        createdAt: now,
        decidedAt: now,
        appliedAt: now,
      },
    });
    await writeItem(tx, item, "true");
  });
  clearPaymentSettingsCache();
  return { paused: true };
}

/* ----------------------------------------------------------------------- reads */

async function handlesFor(ids: number[]): Promise<Map<number, string | null>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, handle: true },
  });
  return new Map(users.map(user => [user.id, user.handle]));
}

type ChangeRow = Awaited<ReturnType<typeof prisma.adminChange.findMany>>[number];

function present(change: ChangeRow, handles: Map<number, string | null>, now: Date) {
  const item = PAYMENT_ITEM_BY_ID[change.key];
  const scheduled =
    change.status === "approved" &&
    change.effectiveAt !== null &&
    change.effectiveAt.getTime() > now.getTime();
  return {
    id: Buffer.from(change.id).toString("hex"),
    key: change.key,
    label: item?.label ?? change.key,
    target: change.target,
    oldValue: change.oldValue,
    newValue: change.newValue,
    oldText: item ? formatPaymentValue(item, change.oldValue) : change.oldValue,
    newText: item ? formatPaymentValue(item, change.newValue) : change.newValue,
    effectiveAt: change.effectiveAt?.toISOString() ?? null,
    reason: change.reason,
    status: change.status as AdminChangeStatus,
    scheduled,
    draftedById: change.draftedById,
    draftedBy: handles.get(change.draftedById) ?? null,
    approvedById: change.approvedById,
    approvedBy: change.approvedById ? (handles.get(change.approvedById) ?? null) : null,
    decisionNote: change.decisionNote,
    safeTxHash: change.safeTxHash,
    txHash: change.txHash,
    createdAt: change.createdAt.toISOString(),
    decidedAt: change.decidedAt?.toISOString() ?? null,
    appliedAt: change.appliedAt?.toISOString() ?? null,
    expiresAt:
      change.status === "draft"
        ? new Date(change.createdAt.getTime() + ADMIN_CHANGE_DRAFT_TTL_MS).toISOString()
        : null,
  };
}

export type PresentedChange = ReturnType<typeof present>;

export async function listChanges({
  filter = "all",
  target,
  limit = 50,
  before,
  now = new Date(),
}: {
  filter?: ChangeFilter;
  target?: "server" | "contract";
  limit?: number;
  before?: Date;
  now?: Date;
}) {
  await expireStaleDrafts(now);
  const rows = await prisma.adminChange.findMany({
    where: {
      area: AREA,
      ...(filter !== "all" ? { status: { in: FILTER_STATUSES[filter] } } : {}),
      ...(target ? { target } : {}),
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const handles = await handlesFor(
    page.flatMap(row => [row.draftedById, ...(row.approvedById ? [row.approvedById] : [])])
  );
  return {
    items: page.map(row => present(row, handles, now)),
    nextBefore: rows.length > limit ? page[page.length - 1]!.createdAt.toISOString() : null,
  };
}

/** Every change for the CSV export, newest first, capped at 5,000 rows. */
export async function exportChanges(now = new Date()) {
  const { items } = await listChanges({ limit: 5_000, now });
  return items;
}

/** Settings page data (a2): every catalog item with its value, range and last change. */
export async function settingsView(now = new Date()) {
  await expireStaleDrafts(now);
  const settings = await paymentSettings(now.getTime());
  const limits = contractLimits();
  const onChain = contractValues(limits);

  const latest = await prisma.adminChange.findMany({
    where: { area: AREA, status: { in: ["applied", ...OPEN] } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const handles = await handlesFor(
    latest.flatMap(row => [row.draftedById, ...(row.approvedById ? [row.approvedById] : [])])
  );
  const lastApplied = new Map<string, PresentedChange>();
  const waiting = new Map<string, PresentedChange>();
  for (const row of latest) {
    const presented = present(row, handles, now);
    if (row.status === "applied" && !lastApplied.has(row.key)) lastApplied.set(row.key, presented);
    if (OPEN.includes(row.status as AdminChangeStatus) && !waiting.has(row.key)) {
      waiting.set(row.key, presented);
    }
  }

  return {
    contractSource: limits.source,
    items: PAYMENT_ITEMS.map(item => {
      const value =
        item.target === "server" ? (settings.values[item.id] ?? null) : (onChain[item.id] ?? null);
      return {
        id: item.id,
        label: item.label,
        hint: item.hint ?? null,
        group: item.group,
        target: item.target,
        kind: item.kind,
        unit: item.unit ?? null,
        allowed: item.allowed,
        effectiveDate: item.effectiveDate ?? false,
        hidden: item.hidden ?? false,
        value,
        valueText: formatPaymentValue(item, value),
        lastChange: lastApplied.get(item.id) ?? null,
        waiting: waiting.get(item.id) ?? null,
      };
    }),
  };
}

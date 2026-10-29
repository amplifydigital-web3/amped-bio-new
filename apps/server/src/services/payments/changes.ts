import { getAddress, isAddress, type Address } from "viem";
import { prisma } from "@repo/database";
import {
  ADMIN_CHANGE_DRAFT_TTL_MS,
  PAYMENT_ITEMS,
  PAYMENT_ITEM_BY_ID,
  formatPaymentValue,
  parseAddressListChange,
  type AdminChangeStatus,
  type PaymentItem,
} from "@repo/constants";
import { safeAppUrl } from "@repo/web3";
import { uuidv7 } from "../../utils/uuid-v7";
import { paymentChain } from "../usdc/chain";
import { getRelayer, isRelayerConfigured } from "../usdc/relayer";
import {
  currentContractValue,
  encodeContractCall,
  encodePauseCall,
  validateContractValue,
} from "./contractChanges";
import {
  ampedPayAddress,
  clearOnchainCache,
  readContractState,
  readRelayers,
  safeAddress as safeAddressOrNull,
  type ContractState,
} from "./onchain";
import { pauseThroughPauser } from "./pauser";
import { SafeProposalError, proposalStatus, proposeToSafe, safeMode } from "./safe";
import {
  PaymentSettingError,
  checkEffectiveAt,
  clearPaymentSettingsCache,
  contractValues,
  itemRows,
  limitsFromState,
  liveContractLimits,
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
 * On chain values follow the same rule, then go to the Safe (spec 3.6): approval proposes
 * the Safe transaction and the change reads Proposed until owners execute it and the
 * indexer reads the event. Pause contract applies at once through the pauser account;
 * Resume contract is drafted, approved and executed by the Safe.
 */

export class AdminChangeError extends Error {}

const AREA = "payments";

/** drafted_by_id for a change the indexer read from the contract with no matching draft. */
export const OUTSIDE_PORTAL_USER_ID = 0;
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

function requireChangeableItem(itemId: string): PaymentItem {
  const item = PAYMENT_ITEM_BY_ID[itemId];
  if (!item) throw new AdminChangeError("That setting does not exist.");
  if (item.target === "fixed") {
    throw new AdminChangeError("This value is fixed in the audited contract and cannot change.");
  }
  return item;
}

/** Relayer addresses to check on chain: the CDP relayer and every one the log names. */
async function relayerCandidates(): Promise<Address[]> {
  const out: Address[] = [];
  if (isRelayerConfigured()) {
    try {
      out.push(await getRelayer().address());
    } catch {
      // The relayer card on Overview reports this; the log candidates still apply
    }
  }
  const rows = await prisma.adminChange.findMany({
    where: { area: AREA, key: "relayers" },
    select: { newValue: true },
  });
  for (const row of rows) {
    const change = parseAddressListChange(row.newValue);
    if (change && isAddress(change.address)) out.push(getAddress(change.address));
  }
  return out;
}

export interface OnchainContext {
  state: ContractState;
  relayers: Address[];
}

/** A fresh contract read for a draft or an approval. Refuses when the contract is not readable. */
async function onchainContext(now: Date): Promise<OnchainContext> {
  clearOnchainCache();
  const read = await readContractState(now.getTime());
  if (!read) {
    throw new AdminChangeError(
      "AmpedPay is not deployed in this environment. Set AMPEDPAY_ADDRESS after the deploy."
    );
  }
  if (!read.ok) {
    throw new AdminChangeError("The contract did not answer. On chain changes need a live read.");
  }
  const relayers = await readRelayers(await relayerCandidates(), now.getTime());
  if (!relayers?.ok) {
    throw new AdminChangeError("The contract did not answer. On chain changes need a live read.");
  }
  return { state: read.value, relayers: relayers.value };
}

/** The current value and the canonical new value of a contract change. */
function checkContractChange(
  item: PaymentItem,
  raw: string,
  context: OnchainContext,
  serverValues: Record<string, string>
): { oldValue: string; newValue: string } {
  try {
    const oldValue = currentContractValue(item.id, context.state, context.relayers);
    const newValue = validateContractValue(item.id, raw, {
      state: context.state,
      limits: limitsFromState(context.state),
      relayers: context.relayers,
      serverValues,
    });
    return { oldValue, newValue };
  } catch (error) {
    if (error instanceof PaymentSettingError) throw new AdminChangeError(error.message);
    throw error;
  }
}

export interface DraftInput {
  userId: number;
  itemId: string;
  newValue: string;
  reason: string;
  effectiveAt?: Date | null;
  now?: Date;
}

/** Drafts a change (spec 3.6 step 1). Server values and on chain values alike. */
export async function draftChange(input: DraftInput) {
  const now = input.now ?? new Date();
  const item = requireChangeableItem(input.itemId);
  if (
    (item.id === "payments_paused" || item.id === "contract_paused") &&
    input.newValue.trim() !== "false"
  ) {
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

  if (item.target === "contract") {
    if (input.effectiveAt) {
      throw new AdminChangeError("On chain values apply when the Safe executes and take no date.");
    }
    const { oldValue, newValue } = checkContractChange(
      item,
      input.newValue,
      await onchainContext(now),
      settings.values
    );
    if (newValue === oldValue) {
      throw new AdminChangeError("The new value is the same as the current one.");
    }
    return prisma.adminChange.create({
      data: {
        id: uuidv7(),
        area: AREA,
        target: "contract",
        key: item.id,
        oldValue,
        newValue,
        effectiveAt: null,
        reason,
        status: "draft",
        draftedById: input.userId,
        createdAt: now,
      },
    });
  }

  const oldValue = settings.values[item.id] ?? "";
  let newValue: string;
  let effectiveAt: Date | null;
  try {
    newValue = validateServerValue(item.id, input.newValue, {
      values: settings.values,
      limits: await liveContractLimits(now.getTime()),
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
  const item = requireChangeableItem(change.key);
  if (item.target === "contract") return approveContractChange(change, item, userId, now);

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
      limits: await liveContractLimits(now.getTime()),
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

type ChangeRecord = NonNullable<Awaited<ReturnType<typeof prisma.adminChange.findUnique>>>;

/**
 * Approval of an on chain change (spec 3.6 steps 2 and 3). The value is checked again
 * against a fresh contract read; a moved value supersedes the draft. The row is claimed
 * first so two admins never propose twice, then the Safe transaction is proposed. If the
 * proposal fails the draft is released for another try. Nothing changes on chain until
 * owners execute it.
 */
async function approveContractChange(
  change: ChangeRecord,
  item: PaymentItem,
  userId: number,
  now: Date
) {
  const contract = ampedPayAddress();
  if (!contract) throw new AdminChangeError("AmpedPay is not deployed in this environment.");
  const context = await onchainContext(now);
  const settings = await paymentSettings(now.getTime());
  const current = currentContractValue(item.id, context.state, context.relayers);
  const stillCurrent =
    item.id === "relayers" ? true : current.toLowerCase() === change.oldValue.toLowerCase();
  if (!stillCurrent) {
    await prisma.adminChange.updateMany({
      where: { id: change.id, status: "draft" },
      data: { status: "superseded", decidedAt: now },
    });
    throw new AdminChangeError(
      "This value changed on chain since the draft. Draft it again from the current value."
    );
  }
  checkContractChange(item, change.newValue, context, settings.values);

  const claimed = await prisma.adminChange.updateMany({
    where: { id: change.id, status: "draft" },
    data: { status: "approved", approvedById: userId, decidedAt: now },
  });
  if (claimed.count === 0) throw new AdminChangeError("Another admin decided this change first.");

  let proposal: Awaited<ReturnType<typeof proposeToSafe>>;
  try {
    proposal = await proposeToSafe(encodeContractCall(contract, item.id, change.newValue));
  } catch (error) {
    await prisma.adminChange.updateMany({
      where: { id: change.id, status: "approved" },
      data: { status: "draft", approvedById: null, decidedAt: null },
    });
    if (error instanceof SafeProposalError) throw new AdminChangeError(error.message);
    console.error("[payments] Safe proposal failed", error);
    throw new AdminChangeError("The Safe proposal did not go through. Nothing was changed.");
  }

  await prisma.adminChange.update({
    where: { id: change.id },
    data: {
      status: "proposed",
      safeTxHash: proposal.safeTxHash,
      safeNonce: proposal.nonce,
      chainId: proposal.chainId,
      decisionNote:
        proposal.mode === "service"
          ? "Proposed to the Safe. Owners confirm and execute it in the Safe app."
          : "Waiting for an owner to submit it in the Safe app. No Safe service key is set.",
    },
  });
  return {
    status: "proposed" as const,
    mode: proposal.mode,
    safeTxHash: proposal.safeTxHash,
  };
}

/**
 * Pause the contract at once (spec 3.5 exception, decision 2, acceptance 6). One
 * payments_admin, a reason and two factor. The pauser account sends pause(); its CDP policy
 * allows nothing else. Logged as an applied change with the transaction hash. Resume goes
 * through draft, approval and the Safe.
 */
export async function pauseContract({
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
  const contract = ampedPayAddress();
  if (!contract) throw new AdminChangeError("AmpedPay is not deployed in this environment.");
  const context = await onchainContext(now);
  if (context.state.paused) throw new AdminChangeError("The contract is already paused.");

  const id = uuidv7();
  let txHash: string;
  try {
    txHash = await pauseThroughPauser(encodePauseCall(contract), Buffer.from(id).toString("hex"));
  } catch (error) {
    if (error instanceof Error && error.name === "PauserError") {
      throw new AdminChangeError(error.message);
    }
    throw error;
  }
  await prisma.adminChange.create({
    data: {
      id,
      area: AREA,
      target: "contract",
      key: "contract_paused",
      oldValue: "false",
      newValue: "true",
      reason: text,
      status: "applied",
      draftedById: userId,
      decisionNote: "Sent through the pauser account. Resume needs a second admin and the Safe.",
      txHash,
      chainId: paymentChain.id,
      createdAt: now,
      decidedAt: now,
      appliedAt: now,
    },
  });
  clearOnchainCache();
  return { paused: true, txHash };
}

/**
 * Rejects a waiting change with a note. Any payments_admin, including the drafter
 * withdrawing it. A proposed on chain change closes here; owners also reject it in the Safe
 * so its nonce does not block later proposals.
 */
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
    where: { id: changeId, area: AREA, status: { in: ["draft", "approved", "proposed"] } },
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
    safeNonce: change.safeNonce,
    txHash: change.txHash,
    chainId: change.chainId,
    // Read from the contract with no portal draft behind it (drafted_by_id 0)
    outsidePortal: change.draftedById === OUTSIDE_PORTAL_USER_ID,
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
  const read = await readContractState(now.getTime());
  const state = read?.ok ? read.value : null;
  const relayers = state ? await readRelayers(await relayerCandidates(), now.getTime()) : null;
  const limits = state ? limitsFromState(state) : await liveContractLimits(now.getTime());
  const onChain = contractValues(limits, state, relayers?.ok ? relayers.value : null);

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
    contractDeployed: read !== null,
    contractReadFailed: read !== null && !read.ok,
    readAt: state?.readAt.toISOString() ?? null,
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

/**
 * The Safe transaction behind an on chain change (board a3): what owners sign, where to find
 * it, and live confirmations from the Safe service. Rebuilt from the change, so the portal
 * shows exactly what was proposed.
 */
export async function changeSafeDetails(changeId: Buffer, now = new Date()) {
  const change = await prisma.adminChange.findUnique({ where: { id: changeId } });
  if (!change || change.area !== AREA) throw new AdminChangeError("That change does not exist.");
  if (change.target !== "contract") return null;
  const contract = ampedPayAddress();
  const safe = safeAddressOrNull();
  const chainId = change.chainId ?? paymentChain.id;
  let call: { to: string; data: string; method: string } | null = null;
  if (contract && change.key !== "contract_paused") {
    call = encodeContractCall(contract, change.key, change.newValue);
  } else if (contract && change.newValue === "false") {
    call = encodeContractCall(contract, "contract_paused", "false");
  } else if (contract) {
    call = encodePauseCall(contract);
  }
  const status =
    change.status === "proposed" && change.safeTxHash
      ? await proposalStatus(change.safeTxHash, now.getTime())
      : null;
  return {
    mode: safeMode(),
    safe,
    chainId,
    nonce: change.safeNonce,
    safeTxHash: change.safeTxHash,
    to: call?.to ?? null,
    data: call?.data ?? null,
    method: call?.method ?? null,
    safeUrl: safe ? safeAppUrl(chainId, safe, change.safeTxHash) : null,
    queueUrl: safe ? safeAppUrl(chainId, safe) : null,
    confirmations: status?.confirmations ?? null,
    required: status?.required ?? null,
    executed: status?.executed ?? false,
    txHash: change.txHash ?? status?.transactionHash ?? null,
  };
}

import { TRPCError } from "@trpc/server";
import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  HANDLE_REGEX,
  SYSTEM_RESERVED_HANDLES,
  SYSTEM_RESERVED_PREFIXES,
  handleKey,
  handlePrefixForm,
  handleSkeleton,
  isSystemReservedHandle,
  matchReservedIn,
  type AdminReservedRow,
  type ReservedHandleCategory,
  type ReservedHandleKind,
} from "@repo/constants";
import { prisma } from "@repo/database";
import { writeAudit, type Tx } from "../adminAudit";
import { changeHandle } from "../pageHandle";
import { bumpReservedVersion } from "../reservedHandles";
import { sendHandleAssigned } from "../../utils/email/email";
import { uuidv7 } from "../../utils/uuid-v7";
import {
  COLLISIONS_LISTED,
  PREFIX_MAX_ACCOUNTS,
  collidingUserIds,
  countColliding,
  describeAccounts,
} from "./collisions";
import {
  EXTEND_DAYS,
  MAX_EXTENSIONS,
  renameAccount,
  renameTarget,
  sendNoticeEmails,
  startNotice,
  type PendingNoticeEmail,
} from "./notices";

/**
 * Reserved handles admin (Build Board D2, docs/features/reserved-handles.md
 * section 5 and 7). Every mutation writes one audit row per changed object and
 * bumps the matcher cache version after commit. System tier words come from
 * code and can never be reserved, edited, assigned or released here.
 */

export type HolderAction = "keep" | "notice";
type Category = ReservedHandleCategory;

/** Undo for a release or an ended redirect: 8 s toast, plus slack for the round trip */
export const UNDO_WINDOW_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const RESERVE_ERRORS = {
  format: "Use only a to z, 0 to 9, - and _.",
  prefix: "A prefix needs 3 or more letters or digits, then - or _.",
  holdEnds: "A hold needs an end date.",
  endsPast: "The end date must be in the future.",
  noEnds: "Company and Trust words do not end.",
} as const;

function idHex(id: Buffer | Uint8Array): string {
  return Buffer.from(id).toString("hex");
}

function idFromHex(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

/** The default action for an account that holds a newly reserved word (decision A2) */
export function defaultHolderAction(category: Category): HolderAction {
  return category === "COMPANY" || category === "TRUST" ? "notice" : "keep";
}

function toMatcherRow(row: {
  id: Buffer | Uint8Array;
  word: string;
  kind: ReservedHandleKind;
  category: Category;
  expiresAt: Date | null;
  assignedUserId: number | null;
}): AdminReservedRow {
  return { ...row, id: idHex(row.id) };
}

/** Normalizes and checks a word for Reserve (spec 7.3). Returns the stored form. */
export function validateWord(raw: string, kind: ReservedHandleKind): string {
  const word = handleKey(raw);
  if (!HANDLE_REGEX.test(word) || word.length > HANDLE_MAX_LENGTH)
    badRequest(RESERVE_ERRORS.format);
  if (kind === "PREFIX") {
    const body = word.slice(0, -1);
    const lettersOrDigits = body.replace(/[^a-z0-9]/g, "").length;
    if (!/[-_]$/.test(word) || lettersOrDigits < 3 || !/^[a-z0-9]/.test(word)) {
      badRequest(RESERVE_ERRORS.prefix);
    }
    if (SYSTEM_RESERVED_PREFIXES.some(prefix => word.startsWith(prefix))) {
      badRequest(`${word} is a system word, reserved in code.`);
    }
  } else {
    if (word.length < HANDLE_MIN_LENGTH) badRequest(RESERVE_ERRORS.format);
    if (isSystemReservedHandle(word)) badRequest(`${word} is a system word, reserved in code.`);
  }
  return word;
}

function validateEnds(category: Category, expiresAt: Date | null | undefined, now = new Date()) {
  if (category === "HOLD" && !expiresAt) badRequest(RESERVE_ERRORS.holdEnds);
  if ((category === "COMPANY" || category === "TRUST") && expiresAt) {
    badRequest(RESERVE_ERRORS.noEnds);
  }
  if (expiresAt && expiresAt.getTime() <= now.getTime()) badRequest(RESERVE_ERRORS.endsPast);
}

/** Refuses a word an admin tier row already covers (spec 7.3) */
async function assertNotReserved(db: Tx | typeof prisma, word: string, kind: ReservedHandleKind) {
  const rows = (
    await db.reservedHandle.findMany({
      select: {
        id: true,
        word: true,
        kind: true,
        category: true,
        expiresAt: true,
        assignedUserId: true,
      },
    })
  ).map(toMatcherRow);
  const live = rows.filter(row => row.expiresAt === null || row.expiresAt > new Date());
  const taken =
    kind === "EXACT"
      ? matchReservedIn(word, live).reserved
      : live.some(
          row => row.kind === "PREFIX" && handlePrefixForm(row.word) === handlePrefixForm(word)
        ) || rows.some(row => row.word === word);
  if (taken) {
    badRequest(`${word} is already reserved. Open it from the Reserved tab to edit it.`);
  }
}

// ---------------------------------------------------------------- reads

export type WordFilter =
  | "all"
  | "system"
  | "company"
  | "trust"
  | "brand"
  | "partner"
  | "hold"
  | "assigned";

export type WordRow = {
  id: string | null;
  word: string;
  kind: ReservedHandleKind;
  tier: "system" | "admin";
  category: Category | null;
  reason: string | null;
  status: "reserved" | "assigned" | "ends";
  expiresAt: Date | null;
  assignedTo: { id: number; handle: string | null } | null;
  addedBy: { id: number; handle: string | null } | null;
  addedAt: Date | null;
};

function systemRows(): WordRow[] {
  const exact = [...SYSTEM_RESERVED_HANDLES].sort().map(word => ({ word, kind: "EXACT" as const }));
  const prefixes = SYSTEM_RESERVED_PREFIXES.map(word => ({ word, kind: "PREFIX" as const }));
  return [...exact, ...prefixes].map(({ word, kind }) => ({
    id: null,
    word,
    kind,
    tier: "system",
    category: null,
    reason: null,
    status: "reserved",
    expiresAt: null,
    assignedTo: null,
    addedBy: null,
    addedAt: null,
  }));
}

async function handlesById(ids: number[]): Promise<Map<number, string | null>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, handle: true },
  });
  return new Map(users.map(user => [user.id, user.handle]));
}

async function adminRows(): Promise<WordRow[]> {
  const rows = await prisma.reservedHandle.findMany({ orderBy: { word: "asc" } });
  const handles = await handlesById(
    rows
      .flatMap(row => [row.assignedUserId, row.createdById])
      .filter((id): id is number => id !== null)
  );
  return rows.map(row => ({
    id: idHex(row.id),
    word: row.word,
    kind: row.kind,
    tier: "admin",
    category: row.category,
    reason: row.reason,
    status: row.assignedUserId !== null ? "assigned" : row.expiresAt ? "ends" : "reserved",
    expiresAt: row.expiresAt,
    assignedTo:
      row.assignedUserId !== null
        ? { id: row.assignedUserId, handle: handles.get(row.assignedUserId) ?? null }
        : null,
    addedBy:
      row.createdById !== null
        ? { id: row.createdById, handle: handles.get(row.createdById) ?? null }
        : null,
    addedAt: row.createdAt,
  }));
}

export async function listWords(input: {
  filter: WordFilter;
  search?: string;
  cursor?: number;
  limit: number;
}) {
  const all = [...(await adminRows()), ...systemRows()];
  const search = input.search ? handleKey(input.search) : "";
  const filtered = all.filter(row => {
    if (input.filter === "system" && row.tier !== "system") return false;
    if (input.filter === "assigned" && row.status !== "assigned") return false;
    if (
      !["all", "system", "assigned"].includes(input.filter) &&
      row.category !== input.filter.toUpperCase()
    ) {
      return false;
    }
    if (!search) return true;
    return row.word.includes(search) || (row.assignedTo?.handle ?? "").includes(search);
  });
  const start = input.cursor ?? 0;
  const items = filtered.slice(start, start + input.limit);
  const next = start + input.limit < filtered.length ? start + input.limit : null;
  return { items, total: filtered.length, nextCursor: next };
}

const LOG_SELECT = {
  id: true,
  actorId: true,
  action: true,
  targetUserId: true,
  subject: true,
  reason: true,
  createdAt: true,
} as const;

async function withLogHandles<
  T extends { id: Uint8Array; actorId: number | null; targetUserId: number | null },
>(rows: T[]) {
  const handles = await handlesById(
    rows.flatMap(row => [row.actorId, row.targetUserId]).filter((id): id is number => id !== null)
  );
  return rows.map(row => ({
    ...row,
    id: idHex(row.id),
    actorHandle: row.actorId !== null ? (handles.get(row.actorId) ?? null) : null,
    targetHandle: row.targetUserId !== null ? (handles.get(row.targetUserId) ?? null) : null,
  }));
}

/** One word: the row, its holder, the accounts on notice, and the last 5 log rows (RA4) */
export async function getWord(input: { id: string } | { word: string }) {
  let row: WordRow | undefined;
  if ("id" in input) {
    row = (await adminRows()).find(candidate => candidate.id === input.id);
  } else {
    const word = handleKey(input.word);
    row =
      systemRows().find(candidate => candidate.word === word) ??
      (await adminRows()).find(candidate => candidate.word === word);
  }
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That word is not reserved." });

  const [notices, log] = await Promise.all([
    prisma.handleNotice.findMany({
      where: { reservedWord: row.word, state: { in: ["NOTICE_SENT", "FAILED", "EXEMPT"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { id: true, handle: true } } },
    }),
    prisma.adminAuditLog.findMany({
      where: { subject: row.word, action: { startsWith: "handle." } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: LOG_SELECT,
    }),
  ]);

  return {
    ...row,
    notices: notices.map(notice => ({
      id: idHex(notice.id),
      state: notice.state,
      deadline: notice.deadline,
      oldHandle: notice.oldHandle,
      user: notice.user,
    })),
    log: await withLogHandles(log),
  };
}

export async function checkCollisions(input: { word: string; kind: ReservedHandleKind }) {
  const word = validateWord(input.word, input.kind);
  const total = await countColliding(prisma, word, input.kind);
  const tooBroad = input.kind === "PREFIX" && total > PREFIX_MAX_ACCOUNTS;
  const ids = tooBroad ? [] : await collidingUserIds(prisma, word, input.kind, COLLISIONS_LISTED);
  return {
    word,
    total: tooBroad ? PREFIX_MAX_ACCOUNTS + 1 : total,
    tooBroad,
    accounts: await describeAccounts(prisma, ids),
  };
}

// ---------------------------------------------------------------- writes

type AfterCommit = { emails: PendingNoticeEmail[]; assigned?: AssignedEmail };
type AssignedEmail = {
  userId: number;
  handle: string;
  oldHandle: string | null;
  redirects: boolean;
};

async function afterCommit(work: AfterCommit) {
  await bumpReservedVersion();
  await sendNoticeEmails(work.emails);
  if (work.assigned) {
    const { userId, ...options } = work.assigned;
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (user?.email) await sendHandleAssigned(user.email, options);
    } catch (error) {
      console.error(`[reserved-handles] assigned email failed for user ${userId}`, error);
    }
  }
}

/** Records a kept account (spec 7.3): an assignment for its exact word, else an EXEMPT notice */
async function keepHolder(
  tx: Tx,
  options: {
    rowId: Buffer;
    word: string;
    kind: ReservedHandleKind;
    userId: number;
    handle: string;
    actorId: number;
    reason: string;
    canAssign: boolean;
  }
): Promise<boolean> {
  if (options.kind === "EXACT" && options.canAssign && options.handle === options.word) {
    const current = await tx.reservedHandle.findUnique({
      where: { assignedUserId: options.userId },
      select: { id: true },
    });
    if (!current) {
      await tx.reservedHandle.update({
        where: { id: options.rowId },
        data: { assignedUserId: options.userId },
      });
      await writeAudit(tx, {
        actorId: options.actorId,
        action: "handle.assign",
        targetUserId: options.userId,
        subject: options.word,
        reason: options.reason,
        after: { assignedUserId: options.userId, handle: options.handle },
      });
      return true;
    }
  }
  await tx.handleNotice.upsert({
    where: { userId_reservedWord: { userId: options.userId, reservedWord: options.word } },
    create: {
      id: uuidv7(),
      userId: options.userId,
      reservedWord: options.word,
      tier: "ADMIN",
      state: "EXEMPT",
      oldHandle: options.handle,
    },
    update: { state: "EXEMPT", oldHandle: options.handle, deadline: null },
  });
  await writeAudit(tx, {
    actorId: options.actorId,
    action: "handle.exempt",
    targetUserId: options.userId,
    subject: options.word,
    reason: options.reason,
    after: { handle: options.handle },
  });
  return false;
}

export async function reserve(
  actorId: number,
  input: {
    word: string;
    kind: ReservedHandleKind;
    category: Category;
    reason: string;
    expiresAt?: Date | null;
    defaultAction?: HolderAction;
    holders: { userId: number; action: HolderAction }[];
  }
) {
  const word = validateWord(input.word, input.kind);
  validateEnds(input.category, input.expiresAt);
  const defaultAction = input.defaultAction ?? defaultHolderAction(input.category);
  const work: AfterCommit = { emails: [] };

  const result = await prisma.$transaction(
    async tx => {
      await assertNotReserved(tx, word, input.kind);

      const total = await countColliding(tx, word, input.kind);
      if (input.kind === "PREFIX" && total > PREFIX_MAX_ACCOUNTS) {
        badRequest(
          `${word} matches more than ${PREFIX_MAX_ACCOUNTS} accounts. Reserve a narrower word.`
        );
      }
      const allIds = await collidingUserIds(tx, word, input.kind);
      const listed = allIds.slice(0, COLLISIONS_LISTED);
      const sent = new Map(input.holders.map(holder => [holder.userId, holder.action]));
      const same = listed.length === sent.size && listed.every(id => sent.has(id));
      if (!same) {
        conflict("The accounts that hold this word changed. Check them again before you save.");
      }

      const id = uuidv7();
      const row = await tx.reservedHandle.create({
        data: {
          id,
          word,
          kind: input.kind,
          category: input.category,
          reason: input.reason,
          expiresAt: input.expiresAt ?? null,
          createdById: actorId,
        },
      });
      await writeAudit(tx, {
        actorId,
        action: "handle.reserve",
        subject: word,
        reason: input.reason,
        after: {
          word,
          kind: input.kind,
          category: input.category,
          expiresAt: input.expiresAt ?? null,
          holders: allIds.length,
        },
      });

      const newRow = toMatcherRow(row);
      const users = await tx.user.findMany({
        where: { id: { in: allIds } },
        select: { id: true, handle: true },
      });
      let assigned = false;
      for (const user of users) {
        if (!user.handle) continue;
        const action = sent.get(user.id) ?? defaultAction;
        if (action === "keep") {
          assigned =
            (await keepHolder(tx, {
              rowId: id,
              word,
              kind: input.kind,
              userId: user.id,
              handle: user.handle.toLowerCase(),
              actorId,
              reason: input.reason,
              canAssign: !assigned,
            })) || assigned;
        } else {
          const email = await startNotice(tx, {
            userId: user.id,
            word,
            tier: "ADMIN",
            actorId,
            reason: input.reason,
            extraRows: [newRow],
          });
          if (email) work.emails.push(email);
        }
      }
      return { id: idHex(id), word, holders: allIds.length };
    },
    { timeout: 60_000 }
  );

  await afterCommit(work);
  return result;
}

export async function update(
  actorId: number,
  input: { id: string; category?: Category; reason?: string; expiresAt?: Date | null }
) {
  const id = idFromHex(input.id);
  const result = await prisma.$transaction(async tx => {
    const row = await tx.reservedHandle.findUnique({ where: { id } });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That word is not reserved." });
    const category = input.category ?? row.category;
    const expiresAt = input.expiresAt === undefined ? row.expiresAt : input.expiresAt;
    validateEnds(category, expiresAt);
    const next = await tx.reservedHandle.update({
      where: { id },
      data: { category, expiresAt, reason: input.reason ?? row.reason },
    });
    await writeAudit(tx, {
      actorId,
      action: "handle.update",
      subject: row.word,
      reason: input.reason ?? row.reason,
      before: { category: row.category, reason: row.reason, expiresAt: row.expiresAt },
      after: { category: next.category, reason: next.reason, expiresAt: next.expiresAt },
    });
    return { id: input.id, word: row.word };
  });
  await afterCommit({ emails: [] });
  return result;
}

export async function assign(
  actorId: number,
  input: { id: string; userId: number; reason: string; redirectOld: boolean; notify: boolean }
) {
  const id = idFromHex(input.id);
  let assignedEmail: AssignedEmail | undefined;
  const result = await prisma.$transaction(async tx => {
    const row = await tx.reservedHandle.findUnique({ where: { id } });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That word is not reserved." });
    if (row.kind !== "EXACT") badRequest("Only an exact word can be assigned.");
    if (row.assignedUserId === input.userId) {
      badRequest(`amped.bio/${row.word} is already assigned to this account.`);
    }
    const others = (await collidingUserIds(tx, row.word, "EXACT")).filter(
      userId => userId !== input.userId
    );
    if (others.length > 0) {
      const holder = await tx.user.findUnique({
        where: { id: others[0] },
        select: { handle: true },
      });
      conflict(
        `@${holder?.handle ?? "someone"} holds amped.bio/${row.word}. Rename them or start a notice first.`
      );
    }
    if (row.assignedUserId !== null) {
      // The holder moved off the word without the assignment ending (a direct write)
      await tx.reservedHandle.update({ where: { id }, data: { assignedUserId: null } });
    }
    const { oldHandle } = await changeHandle(tx, input.userId, row.word, {
      skipReservedCheck: true,
      redirectOld: input.redirectOld,
      source: "admin",
    });
    await tx.reservedHandle.update({ where: { id }, data: { assignedUserId: input.userId } });
    await writeAudit(tx, {
      actorId,
      action: "handle.assign",
      targetUserId: input.userId,
      subject: row.word,
      reason: input.reason,
      before: { handle: oldHandle, assignedUserId: row.assignedUserId },
      after: { handle: row.word, assignedUserId: input.userId, redirect: input.redirectOld },
    });
    if (input.notify) {
      assignedEmail = {
        userId: input.userId,
        handle: row.word,
        oldHandle: oldHandle && oldHandle !== row.word ? oldHandle : null,
        redirects: input.redirectOld,
      };
    }
    return { id: input.id, word: row.word, oldHandle };
  });
  await afterCommit({ emails: [], assigned: assignedEmail });
  return result;
}

export async function unassign(
  actorId: number,
  input: { id: string; reason: string; startNotice: boolean }
) {
  const id = idFromHex(input.id);
  const work: AfterCommit = { emails: [] };
  const result = await prisma.$transaction(async tx => {
    const row = await tx.reservedHandle.findUnique({ where: { id } });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That word is not reserved." });
    if (row.assignedUserId === null) badRequest(`amped.bio/${row.word} is not assigned.`);
    const userId = row.assignedUserId;
    await tx.reservedHandle.update({ where: { id }, data: { assignedUserId: null } });
    await writeAudit(tx, {
      actorId,
      action: "handle.unassign",
      targetUserId: userId,
      subject: row.word,
      reason: input.reason,
      before: { assignedUserId: userId },
      after: { assignedUserId: null, startNotice: input.startNotice },
    });
    const user = await tx.user.findUnique({ where: { id: userId }, select: { handle: true } });
    const handle = user?.handle?.toLowerCase();
    if (handle && handleSkeleton(handle) === handleSkeleton(row.word)) {
      if (input.startNotice) {
        const email = await startNotice(tx, {
          userId,
          word: row.word,
          tier: "ADMIN",
          actorId,
          reason: input.reason,
        });
        if (email) work.emails.push(email);
      } else {
        // Keep the handle: Holders shows the account as Exempt (spec 7.4)
        await tx.handleNotice.upsert({
          where: { userId_reservedWord: { userId, reservedWord: row.word } },
          create: {
            id: uuidv7(),
            userId,
            reservedWord: row.word,
            tier: "ADMIN",
            state: "EXEMPT",
            oldHandle: handle,
          },
          update: { state: "EXEMPT", oldHandle: handle, deadline: null },
        });
      }
    }
    return { id: input.id, word: row.word };
  });
  await afterCommit(work);
  return result;
}

export async function release(actorId: number, input: { id: string; reason: string }) {
  const id = idFromHex(input.id);
  const result = await prisma.$transaction(async tx => {
    const row = await tx.reservedHandle.findUnique({ where: { id } });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That word is not reserved." });
    // Accounts that hold the word now keep it; Undo must not count them as a claim
    const holders = await collidingUserIds(tx, row.word, row.kind, COLLISIONS_LISTED * 10);
    await tx.reservedHandle.delete({ where: { id } });
    // Open notices close as cancelled: no email, the accounts keep their handle
    const closed = await tx.handleNotice.updateMany({
      where: { reservedWord: row.word, state: { in: ["NOTICE_SENT", "FAILED"] } },
      data: { state: "CANCELLED", deadline: null },
    });
    const auditId = await writeAudit(tx, {
      actorId,
      action: "handle.release",
      targetUserId: row.assignedUserId,
      subject: row.word,
      reason: input.reason,
      before: {
        id: idHex(row.id),
        word: row.word,
        kind: row.kind,
        category: row.category,
        reason: row.reason,
        expiresAt: row.expiresAt,
        assignedUserId: row.assignedUserId,
        createdById: row.createdById,
        createdAt: row.createdAt,
        holders,
      },
      after: { noticesCancelled: closed.count },
    });
    return { word: row.word, auditId: idHex(auditId), noticesCancelled: closed.count };
  });
  await afterCommit({ emails: [] });
  return result;
}

const releasedRowSchema = {
  parse(value: unknown) {
    const row = value as Record<string, unknown> | null;
    if (!row || typeof row.id !== "string" || typeof row.word !== "string") return null;
    return {
      id: row.id,
      word: row.word,
      kind: row.kind as ReservedHandleKind,
      category: row.category as Category,
      reason: String(row.reason ?? ""),
      expiresAt: row.expiresAt ? new Date(String(row.expiresAt)) : null,
      assignedUserId: typeof row.assignedUserId === "number" ? row.assignedUserId : null,
      createdById: typeof row.createdById === "number" ? row.createdById : null,
      createdAt: row.createdAt ? new Date(String(row.createdAt)) : new Date(),
      holders: Array.isArray(row.holders) ? (row.holders as number[]) : [],
    };
  },
};

/** Undo for a release, within the toast (spec 7.4). Does not reopen closed notices. */
export async function restore(actorId: number, input: { auditId: string }) {
  const result = await prisma.$transaction(async tx => {
    const audit = await tx.adminAuditLog.findUnique({ where: { id: idFromHex(input.auditId) } });
    if (!audit || audit.action !== "handle.release") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Nothing to undo." });
    }
    if (Date.now() - audit.createdAt.getTime() > UNDO_WINDOW_MS) {
      badRequest("Too late to undo. Reserve the word again.");
    }
    const row = releasedRowSchema.parse(audit.before);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Nothing to undo." });
    if (await tx.reservedHandle.findUnique({ where: { word: row.word } })) {
      badRequest(`amped.bio/${row.word} is already reserved.`);
    }
    if (row.kind === "EXACT") {
      const holders = (await collidingUserIds(tx, row.word, "EXACT")).filter(
        userId => userId !== row.assignedUserId && !row.holders.includes(userId)
      );
      if (holders.length > 0) {
        conflict(`Someone claimed amped.bio/${row.word}. Reserve it again to start a notice.`);
      }
    }
    let assignedUserId = row.assignedUserId;
    if (assignedUserId !== null) {
      const holder = await tx.user.findUnique({
        where: { id: assignedUserId },
        select: { handle: true, reservedHandle: { select: { id: true } } },
      });
      if (holder?.handle?.toLowerCase() !== row.word || holder.reservedHandle)
        assignedUserId = null;
    }
    await tx.reservedHandle.create({
      data: {
        id: idFromHex(row.id),
        word: row.word,
        kind: row.kind,
        category: row.category,
        reason: row.reason,
        expiresAt: row.expiresAt,
        assignedUserId,
        createdById: row.createdById,
        createdAt: row.createdAt,
      },
    });
    await writeAudit(tx, {
      actorId,
      action: "handle.restore",
      targetUserId: assignedUserId,
      subject: row.word,
      reason: "Undo release",
      after: { id: row.id, assignedUserId },
    });
    return { id: row.id, word: row.word };
  });
  await afterCommit({ emails: [] });
  return result;
}

// ---------------------------------------------------------------- holders

export type HolderFilter = "open" | "notice_sent" | "exempt" | "chose_new" | "renamed" | "failed";
const HOLDER_STATES = {
  open: ["NOTICE_SENT", "FAILED"],
  notice_sent: ["NOTICE_SENT"],
  exempt: ["EXEMPT"],
  chose_new: ["CHOSE_NEW"],
  renamed: ["RENAMED"],
  failed: ["FAILED"],
} as const;
/** Chose new and cancelled rows leave the tab 30 days after they end (spec 7.6) */
const ENDED_VISIBLE_DAYS = 30;

export async function listHolders(input: { state: HolderFilter; cursor?: number; limit: number }) {
  const since = new Date(Date.now() - ENDED_VISIBLE_DAYS * DAY_MS);
  const states = [...HOLDER_STATES[input.state]];
  const where = {
    state: { in: states },
    ...(input.state === "chose_new" ? { updatedAt: { gte: since } } : {}),
  };
  const start = input.cursor ?? 0;
  const [total, rows] = await Promise.all([
    prisma.handleNotice.count({ where }),
    prisma.handleNotice.findMany({
      where,
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
      skip: start,
      take: input.limit,
      include: {
        user: {
          select: {
            id: true,
            handle: true,
            name: true,
            page_status: true,
            _count: { select: { followsReceived: true } },
          },
        },
      },
    }),
  ]);
  const redirects = await prisma.handleRedirect.findMany({
    where: { oldHandle: { in: rows.map(row => row.oldHandle) }, endsAt: { gt: new Date() } },
    select: { oldHandle: true },
  });
  const redirected = new Set(redirects.map(redirect => redirect.oldHandle));
  return {
    total,
    nextCursor: start + input.limit < total ? start + input.limit : null,
    items: rows.map(row => ({
      id: idHex(row.id),
      word: row.reservedWord,
      tier: row.tier,
      state: row.state,
      oldHandle: row.oldHandle,
      deadline: row.deadline,
      extensions: row.extensions,
      canExtend: row.state === "NOTICE_SENT" && row.extensions < MAX_EXTENSIONS,
      hasRedirect: redirected.has(row.oldHandle),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      user: {
        id: row.user.id,
        handle: row.user.handle,
        name: row.user.name,
        pageStatus: row.user.page_status,
        followers: row.user._count.followsReceived,
      },
    })),
  };
}

async function loadNotice(tx: Tx, noticeId: string) {
  const notice = await tx.handleNotice.findUnique({ where: { id: idFromHex(noticeId) } });
  if (!notice) throw new TRPCError({ code: "NOT_FOUND", message: "That notice no longer exists." });
  return notice;
}

export async function resendNotice(actorId: number, input: { noticeId: string; reason: string }) {
  const work: AfterCommit = { emails: [] };
  await prisma.$transaction(async tx => {
    const notice = await loadNotice(tx, input.noticeId);
    if (notice.state !== "NOTICE_SENT" && notice.state !== "FAILED") {
      badRequest("Only an open notice can be sent again.");
    }
    // The account keeps the deadline it was told; one already past gets a fresh 7 days
    const deadline =
      notice.deadline && notice.deadline > new Date()
        ? notice.deadline
        : new Date(Date.now() + EXTEND_DAYS * DAY_MS);
    await tx.handleNotice.update({
      where: { id: notice.id },
      data: { state: "NOTICE_SENT", deadline },
    });
    await writeAudit(tx, {
      actorId,
      action: "handle.notice.resend",
      targetUserId: notice.userId,
      subject: notice.reservedWord,
      reason: input.reason,
      before: { state: notice.state, deadline: notice.deadline },
      after: { state: "NOTICE_SENT", deadline },
    });
    work.emails.push({
      noticeId: Buffer.from(notice.id),
      userId: notice.userId,
      handle: notice.oldHandle,
      fallbackHandle: await renameTarget(tx, notice.userId, notice.oldHandle),
      deadline,
    });
  });
  await afterCommit(work);
  return { ok: true };
}

export async function extendNotice(actorId: number, input: { noticeId: string; reason: string }) {
  return prisma.$transaction(async tx => {
    const notice = await loadNotice(tx, input.noticeId);
    if (notice.state !== "NOTICE_SENT" || !notice.deadline) {
      badRequest("Only a notice that is waiting can be extended.");
    }
    if (notice.extensions >= MAX_EXTENSIONS) badRequest("This notice was already extended twice.");
    const deadline = new Date(notice.deadline.getTime() + EXTEND_DAYS * DAY_MS);
    const claimed = await tx.handleNotice.updateMany({
      where: { id: notice.id, state: "NOTICE_SENT", extensions: notice.extensions },
      data: { deadline, extensions: { increment: 1 } },
    });
    if (claimed.count !== 1) conflict("The notice changed. Refresh and try again.");
    await writeAudit(tx, {
      actorId,
      action: "handle.notice.extend",
      targetUserId: notice.userId,
      subject: notice.reservedWord,
      reason: input.reason,
      before: { deadline: notice.deadline },
      after: { deadline },
    });
    return { deadline };
  });
}

export async function exemptNotice(actorId: number, input: { noticeId: string; reason: string }) {
  const result = await prisma.$transaction(async tx => {
    const notice = await loadNotice(tx, input.noticeId);
    if (notice.tier === "SYSTEM") badRequest("A system word cannot be exempted.");
    if (notice.state !== "NOTICE_SENT" && notice.state !== "FAILED") {
      badRequest("Only an open notice can be exempted.");
    }
    const row = await tx.reservedHandle.findUnique({ where: { word: notice.reservedWord } });
    const user = await tx.user.findUnique({
      where: { id: notice.userId },
      select: { handle: true },
    });
    const handle = user?.handle?.toLowerCase() ?? notice.oldHandle;
    if (row && row.kind === "EXACT" && row.assignedUserId === null && handle === row.word) {
      const current = await tx.reservedHandle.findUnique({
        where: { assignedUserId: notice.userId },
        select: { id: true },
      });
      if (!current) {
        await tx.reservedHandle.update({
          where: { id: row.id },
          data: { assignedUserId: notice.userId },
        });
      }
    }
    await tx.handleNotice.update({
      where: { id: notice.id },
      data: { state: "EXEMPT", deadline: null, oldHandle: handle },
    });
    await writeAudit(tx, {
      actorId,
      action: "handle.exempt",
      targetUserId: notice.userId,
      subject: notice.reservedWord,
      reason: input.reason,
      before: { state: notice.state, deadline: notice.deadline },
      after: { state: "EXEMPT", handle },
    });
    return { ok: true };
  });
  await afterCommit({ emails: [] });
  return result;
}

export async function renameNow(actorId: number, input: { noticeId: string; reason: string }) {
  const result = await prisma.$transaction(
    async tx => {
      const notice = await loadNotice(tx, input.noticeId);
      if (notice.state === "RENAMED" || notice.state === "CHOSE_NEW") {
        badRequest("This account already has a new handle.");
      }
      const user = await tx.user.findUnique({
        where: { id: notice.userId },
        select: { handle: true },
      });
      const handle = user?.handle?.toLowerCase();
      if (!handle) badRequest("This account has no handle.");
      const row = await tx.reservedHandle.findUnique({ where: { word: notice.reservedWord } });
      if (row?.assignedUserId === notice.userId) {
        await tx.reservedHandle.update({ where: { id: row.id }, data: { assignedUserId: null } });
      }
      const target = await renameAccount(tx, {
        userId: notice.userId,
        oldHandle: handle,
        word: notice.reservedWord,
        actorId,
        reason: input.reason,
      });
      await tx.handleNotice.update({
        where: { id: notice.id },
        data: { state: "RENAMED", deadline: null, oldHandle: handle },
      });
      return { handle: target };
    },
    { timeout: 30_000 }
  );
  await afterCommit({ emails: [] });
  return result;
}

export async function startNoticeFor(actorId: number, input: { noticeId: string; reason: string }) {
  const work: AfterCommit = { emails: [] };
  await prisma.$transaction(
    async tx => {
      const notice = await loadNotice(tx, input.noticeId);
      if (notice.state !== "EXEMPT") badRequest("Only an exempt account can be put on notice.");
      const row = await tx.reservedHandle.findUnique({ where: { word: notice.reservedWord } });
      if (row?.assignedUserId === notice.userId) {
        await tx.reservedHandle.update({ where: { id: row.id }, data: { assignedUserId: null } });
      }
      const email = await startNotice(tx, {
        userId: notice.userId,
        word: notice.reservedWord,
        tier: notice.tier,
        actorId,
        reason: input.reason,
      });
      if (email) work.emails.push(email);
    },
    { timeout: 30_000 }
  );
  await afterCommit(work);
  return { ok: true };
}

/** Retry for Failed (spec 7.6): renames again once the deadline passed, else resends */
export async function retryNotice(actorId: number, input: { noticeId: string; reason: string }) {
  const notice = await prisma.handleNotice.findUnique({ where: { id: idFromHex(input.noticeId) } });
  if (!notice) throw new TRPCError({ code: "NOT_FOUND", message: "That notice no longer exists." });
  if (notice.state !== "FAILED") badRequest("Only a failed notice can be retried.");
  if (notice.deadline && notice.deadline.getTime() <= Date.now()) {
    return renameNow(actorId, input);
  }
  return resendNotice(actorId, input);
}

// ---------------------------------------------------------------- redirects

export async function listRedirects(input: { cursor?: number; limit: number }) {
  const where = { endsAt: { gt: new Date() } };
  const start = input.cursor ?? 0;
  const [total, rows] = await Promise.all([
    prisma.handleRedirect.count({ where }),
    prisma.handleRedirect.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: start,
      take: input.limit,
      include: { user: { select: { id: true, handle: true } } },
    }),
  ]);
  return {
    total,
    nextCursor: start + input.limit < total ? start + input.limit : null,
    items: rows.map(row => ({
      oldHandle: row.oldHandle,
      user: row.user,
      createdAt: row.createdAt,
      endsAt: row.endsAt,
      hits: row.hits,
    })),
  };
}

export async function endRedirect(actorId: number, input: { oldHandle: string; reason: string }) {
  const oldHandle = handleKey(input.oldHandle);
  return prisma.$transaction(async tx => {
    const row = await tx.handleRedirect.findUnique({ where: { oldHandle } });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That redirect already ended." });
    await tx.handleRedirect.delete({ where: { oldHandle } });
    const auditId = await writeAudit(tx, {
      actorId,
      action: "handle.redirect.end",
      targetUserId: row.userId,
      subject: oldHandle,
      reason: input.reason,
      before: {
        id: idHex(row.id),
        oldHandle,
        userId: row.userId,
        endsAt: row.endsAt,
        hits: row.hits,
        createdAt: row.createdAt,
      },
    });
    return { oldHandle, auditId: idHex(auditId) };
  });
}

/** Undo for End now (spec 7.7) */
export async function restoreRedirect(actorId: number, input: { auditId: string }) {
  return prisma.$transaction(async tx => {
    const audit = await tx.adminAuditLog.findUnique({ where: { id: idFromHex(input.auditId) } });
    if (!audit || audit.action !== "handle.redirect.end") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Nothing to undo." });
    }
    if (Date.now() - audit.createdAt.getTime() > UNDO_WINDOW_MS) badRequest("Too late to undo.");
    const before = audit.before as Record<string, unknown> | null;
    if (!before || typeof before.oldHandle !== "string" || typeof before.userId !== "number") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Nothing to undo." });
    }
    const oldHandle = before.oldHandle;
    const holder = await tx.user.findFirst({ where: { handle: oldHandle }, select: { id: true } });
    if (holder) conflict(`Someone claimed amped.bio/${oldHandle}. The redirect cannot come back.`);
    await tx.handleRedirect.create({
      data: {
        id: typeof before.id === "string" ? idFromHex(before.id) : uuidv7(),
        oldHandle,
        userId: before.userId,
        endsAt: new Date(String(before.endsAt)),
        hits: typeof before.hits === "number" ? before.hits : 0,
        createdAt: before.createdAt ? new Date(String(before.createdAt)) : new Date(),
      },
    });
    await writeAudit(tx, {
      actorId,
      action: "handle.redirect.restore",
      targetUserId: before.userId,
      subject: oldHandle,
      reason: "Undo end redirect",
    });
    return { oldHandle };
  });
}

// ---------------------------------------------------------------- log

export type LogFilter = "all" | "reserve" | "assign" | "release" | "notice" | "expired";
const LOG_ACTIONS: Record<Exclude<LogFilter, "all">, string[]> = {
  reserve: ["handle.reserve", "handle.update"],
  assign: ["handle.assign", "handle.unassign"],
  release: ["handle.release", "handle.restore"],
  notice: [
    "handle.notice.start",
    "handle.notice.resend",
    "handle.notice.extend",
    "handle.exempt",
    "handle.rename",
    "handle.notice.cancelled",
  ],
  expired: ["handle.expired", "handle.redirect.expired"],
};

function logWhere(input: { action?: LogFilter; actorId?: number | null; from?: Date; to?: Date }) {
  return {
    action:
      input.action && input.action !== "all"
        ? { in: LOG_ACTIONS[input.action] }
        : { startsWith: "handle." },
    ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
    ...(input.from || input.to
      ? {
          createdAt: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lte: input.to } : {}),
          },
        }
      : {}),
  };
}

export async function listLog(input: {
  action?: LogFilter;
  actorId?: number | null;
  cursor?: number;
  limit: number;
}) {
  const where = logWhere(input);
  const start = input.cursor ?? 0;
  const [total, rows] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: start,
      take: input.limit,
      select: LOG_SELECT,
    }),
  ]);
  return {
    total,
    nextCursor: start + input.limit < total ? start + input.limit : null,
    items: await withLogHandles(rows),
  };
}

/** The admins who appear in the log, for the admin filter */
export async function logActors() {
  const rows = await prisma.adminAuditLog.findMany({
    where: { action: { startsWith: "handle." }, actorId: { not: null } },
    distinct: ["actorId"],
    select: { actorId: true },
  });
  const ids = rows.map(row => row.actorId).filter((id): id is number => id !== null);
  const handles = await handlesById(ids);
  return ids.map(id => ({ id, handle: handles.get(id) ?? null }));
}

const EXPORT_MAX_ROWS = 10_000;

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV of the log for a date range (spec 7.11): time, admin handle, action,
 * word, target handle, reason. No email and no before or after JSON.
 */
export async function exportLog(input: { from: Date; to: Date; action?: LogFilter }) {
  const rows = await prisma.adminAuditLog.findMany({
    where: logWhere(input),
    orderBy: { createdAt: "asc" },
    take: EXPORT_MAX_ROWS,
    select: LOG_SELECT,
  });
  const named = await withLogHandles(rows);
  const lines = [
    ["time", "admin", "action", "word", "target", "reason"].join(","),
    ...named.map(row =>
      [
        row.createdAt.toISOString(),
        row.actorId === null ? "System" : `@${row.actorHandle ?? row.actorId}`,
        row.action,
        row.subject ?? "",
        row.targetUserId === null ? "" : `@${row.targetHandle ?? row.targetUserId}`,
        row.reason ?? "",
      ]
        .map(csvCell)
        .join(",")
    ),
  ];
  return { csv: lines.join("\n"), rows: named.length, truncated: named.length === EXPORT_MAX_ROWS };
}

// ---------------------------------------------------------------- users slab

/** The assigned word per account, for the Reserved badge on the Users slab */
export async function assignedWords(userIds: number[]): Promise<Map<number, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.reservedHandle.findMany({
    where: { assignedUserId: { in: userIds } },
    select: { word: true, assignedUserId: true },
  });
  return new Map(
    rows.flatMap(row =>
      row.assignedUserId !== null ? [[row.assignedUserId, row.word] as const] : []
    )
  );
}

/** Admin tier exact words with no holder, for Give reserved word (spec 7.1) */
export async function assignableWords() {
  const rows = await prisma.reservedHandle.findMany({
    where: { kind: "EXACT", assignedUserId: null },
    orderBy: { word: "asc" },
    select: { id: true, word: true, category: true, expiresAt: true },
  });
  return rows
    .filter(row => row.expiresAt === null || row.expiresAt > new Date())
    .map(row => ({ id: idHex(row.id), word: row.word, category: row.category }));
}

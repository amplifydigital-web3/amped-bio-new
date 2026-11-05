/**
 * The hash blocklist (adult content review 8.2, 8.7 and 10; content PR 7, R1 service).
 * A blocked file can not be uploaded again by anyone: the processor's hash step
 * reads `findBlockedHash` (content state, spec 3.5 step 3.1).
 *
 * - `blockHash` adds sha256 and, when known, the perceptual hash, with the case
 *   and who added it. Blocking a file already on the list keeps the first reason
 *   and fills in what was missing.
 * - `unblockHash` never deletes: it sets removedAt and logs the reason. Child safety
 *   hashes (`csam`) can not be unblocked here.
 * - `findByPhash` matches near copies within the Settings threshold (Hamming
 *   distance over the hex hash).
 */
import { prisma, type BlockedContentHash } from "@repo/database";
import { UNBLOCKABLE_HASH_REASONS, type BlockedHashReason } from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { logSafetyEvent } from "./events";

export class BlocklistError extends Error {
  constructor(readonly reason: "not_found" | "child_safety" | "already_removed") {
    super(reason);
    this.name = "BlocklistError";
  }
}

export type BlockHashInput = {
  sha256: string;
  phash?: string | null;
  reason: BlockedHashReason;
  caseId?: Uint8Array | null;
  /** null for the system (a malware positive, a CSAM match) */
  addedById?: number | null;
};

/** The active row for a sha256: unblocked rows no longer refuse uploads. */
export async function findBlockedHash(sha256: string): Promise<BlockedContentHash | null> {
  const row = await prisma.blockedContentHash.findUnique({ where: { sha256 } });
  return row && !row.removedAt ? row : null;
}

export async function blockHash(input: BlockHashInput): Promise<BlockedContentHash> {
  const caseId = input.caseId ? Buffer.from(input.caseId) : null;
  const existing = await prisma.blockedContentHash.findUnique({ where: { sha256: input.sha256 } });
  const row = existing
    ? await prisma.blockedContentHash.update({
        where: { sha256: input.sha256 },
        data: {
          // A file blocked again after Unblock is active again, with the new reason
          ...(existing.removedAt ? { removedAt: null, reason: input.reason } : {}),
          ...(existing.phash ? {} : { phash: input.phash ?? null }),
          ...(existing.caseId ? {} : { caseId }),
          ...(existing.addedById ? {} : { addedById: input.addedById ?? null }),
        },
      })
    : await prisma.blockedContentHash.create({
        data: {
          id: uuidv7(),
          sha256: input.sha256,
          phash: input.phash ?? null,
          reason: input.reason,
          caseId,
          addedById: input.addedById ?? null,
        },
      });
  await logSafetyEvent({
    caseId,
    actorId: input.addedById ?? null,
    action: "hash_block",
    detail: { sha256: input.sha256.slice(0, 12), reason: row.reason, phash: Boolean(row.phash) },
  });
  return row;
}

export async function unblockHash(
  id: Uint8Array,
  actorId: number,
  reason: string
): Promise<BlockedContentHash> {
  const row = await prisma.blockedContentHash.findUnique({ where: { id: Buffer.from(id) } });
  if (!row) throw new BlocklistError("not_found");
  if ((UNBLOCKABLE_HASH_REASONS as readonly string[]).includes(row.reason)) {
    throw new BlocklistError("child_safety");
  }
  if (row.removedAt) throw new BlocklistError("already_removed");
  const updated = await prisma.blockedContentHash.update({
    where: { id: row.id },
    data: { removedAt: new Date() },
  });
  await logSafetyEvent({
    caseId: row.caseId,
    actorId,
    action: "hash_unblock",
    detail: { sha256: row.sha256.slice(0, 12), reason: row.reason },
    note: reason,
  });
  return updated;
}

/** Bits that differ between two hex hashes of the same length; Infinity otherwise. */
export function phashDistance(a: string, b: string): number {
  if (a.length !== b.length || !/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) {
    return Number.POSITIVE_INFINITY;
  }
  let bits = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

/** Active rows whose perceptual hash is within `threshold` bits. */
export async function findByPhash(phash: string, threshold: number): Promise<BlockedContentHash[]> {
  const rows = await prisma.blockedContentHash.findMany({
    where: { phash: { not: null }, removedAt: null },
  });
  return rows.filter(row => phashDistance(row.phash!, phash) <= threshold);
}

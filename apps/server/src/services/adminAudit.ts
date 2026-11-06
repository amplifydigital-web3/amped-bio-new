import { Prisma, prisma } from "@repo/database";
import { uuidv7 } from "../utils/uuid-v7";

/** A Prisma transaction client from the shared client. */
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type AuditEntry = {
  /** null: the system (seed, sweeper, deletion job) */
  actorId: number | null;
  action: string;
  targetUserId?: number | null;
  subject?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
};

function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Writes one `admin_audit_log` row (docs/features/reserved-handles.md 7.9).
 * Actor and target are plain integers with no foreign key, so the record
 * survives account deletion.
 */
export async function writeAudit(db: Tx, entry: AuditEntry): Promise<Buffer> {
  const id = uuidv7();
  await db.adminAuditLog.create({
    data: {
      id,
      actorId: entry.actorId,
      action: entry.action,
      targetUserId: entry.targetUserId ?? null,
      subject: entry.subject ?? null,
      reason: entry.reason ?? null,
      before: json(entry.before),
      after: json(entry.after),
    },
  });
  return id;
}

import { prisma, type Prisma } from "@repo/database";
import { uuidv7 } from "../../utils/uuid-v7";

/** actor_id for a change the payments worker makes (a payout wallet taking effect). */
export const MERCHANT_SYSTEM_ACTOR = 0;

type AuditClient = Pick<typeof prisma, "merchantAuditLog">;

/**
 * The merchant's audit log (spec 3.8, Console Team page p6). Every member, wallet, fee and
 * status change writes one row. Rows are never edited or deleted.
 */
export async function recordMerchantAudit(
  merchantId: Uint8Array,
  actorId: number,
  action: string,
  detail: Prisma.InputJsonValue | null = null,
  client: AuditClient = prisma
) {
  await client.merchantAuditLog.create({
    data: {
      id: uuidv7(),
      merchantId: Buffer.from(merchantId),
      actorId,
      action,
      detail: detail ?? undefined,
    },
  });
}

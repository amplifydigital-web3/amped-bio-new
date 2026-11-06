/**
 * The Safety log (adult content review 8.6, PR R1). Append only: this module only
 * creates rows, and nothing in the codebase updates or deletes a SafetyEvent.
 * `detail` carries ids, keys and counts, never media URLs, tokens, phone numbers
 * or contact details.
 */
import { prisma, type Prisma } from "@repo/database";
import { uuidv7 } from "../../utils/uuid-v7";

export type SafetyEventInput = {
  caseId?: Uint8Array | null;
  /** null for the system */
  actorId?: number | null;
  action: string;
  detail?: Prisma.InputJsonValue;
  note?: string | null;
};

type EventDb = Pick<typeof prisma, "safetyEvent">;

export async function logSafetyEvent(input: SafetyEventInput, db: EventDb = prisma) {
  return db.safetyEvent.create({
    data: {
      id: uuidv7(),
      caseId: input.caseId ? Buffer.from(input.caseId) : null,
      actorId: input.actorId ?? null,
      action: input.action.slice(0, 32),
      detail: input.detail ?? undefined,
      note: input.note ?? null,
    },
  });
}

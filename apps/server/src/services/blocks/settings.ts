import { prisma, type Prisma } from "@repo/database";
import { hasAttention, stripBlockSettings } from "@repo/constants";
import { isFeatureOn } from "../featureFlags";

// The page save runs outside a transaction today, so both clients are taken
type Tx = Pick<typeof prisma, "block">;

/**
 * Block settings (Block Review v2 B0): schedule, attention and motion save only
 * while the blocksV2 flag is on. Off, a client cannot set them; the editor
 * does not show the rows either.
 */
export function settingsForSave<T>(config: T): T {
  return isFeatureOn("blocksV2") ? config : stripBlockSettings(config);
}

/**
 * BS2: one block per page asks for attention. Setting a preset on one block
 * clears it on every other block of the same page, in the caller's
 * transaction. Returns the ids it cleared.
 */
export async function clearOtherAttention(tx: Tx, userId: number, keepId: number): Promise<number[]> {
  const rows = await tx.block.findMany({
    where: { user_id: userId, NOT: { id: keepId } },
    select: { id: true, config: true },
  });
  const cleared: number[] = [];
  for (const row of rows) {
    if (!hasAttention(row)) continue;
    const { attention: _attention, ...rest } = row.config as Record<string, unknown>;
    await tx.block.update({ where: { id: row.id }, data: { config: rest as Prisma.InputJsonValue } });
    cleared.push(row.id);
  }
  return cleared;
}

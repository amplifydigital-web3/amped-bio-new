/**
 * Gated blocks on public pages (access gating G3, spec 3.9). A link, media or
 * text block with a rule leaves the server as the locked DTO: its label and
 * platform, the rule's kind and summary, and nothing that reveals the
 * destination, body or embed. A custom link's platform is sent as "locked", so
 * not even its favicon domain leaks. While the accessGating flag is off a
 * gated block is left off the page (fails closed).
 */
import {
  LOCKABLE_BLOCK_TYPES,
  isRenderable,
  type BlockGate,
  type BlockType,
} from "@repo/constants";
import { isFeatureOn } from "../featureFlags";
import { gatesFor } from "../content/gate";

type Row = {
  id: number;
  type: string;
  accessRuleId: Uint8Array | null;
};

export const isLockable = (type: string) =>
  (LOCKABLE_BLOCK_TYPES as readonly string[]).includes(type);

/** True when this row is a gated block (lockable type with a rule). */
export function isGatedBlock(row: Pick<Row, "type" | "accessRuleId">) {
  return isLockable(row.type) && row.accessRuleId !== null;
}

/** The public config of a locked block: label and platform only. */
export function lockedConfig(type: string, config: Record<string, unknown> | null) {
  const label = typeof config?.label === "string" ? config.label : "";
  const platform = typeof config?.platform === "string" ? config.platform : type;
  return { label, platform: platform === "custom" ? "locked" : platform };
}

/**
 * Turns the page's sanitized blocks into what a visitor may see. Gated blocks
 * become locked DTOs (flag on) or are dropped (flag off). No clicks on gated
 * blocks: a click count would tell how many fans opened it.
 */
export async function publicBlocksFor<
  T extends { id: number; type: string; config: unknown; clicks?: number | null },
>(blocks: T[], rows: Row[]): Promise<Array<T & { gated?: true; gate?: BlockGate }>> {
  const byId = new Map(rows.map(row => [row.id, row]));
  const gated = blocks.filter(block => {
    const row = byId.get(block.id);
    return row ? isGatedBlock(row) : false;
  });
  if (!gated.length) return blocks;
  if (!isFeatureOn("accessGating")) {
    const drop = new Set(gated.map(block => block.id));
    return blocks.filter(block => !drop.has(block.id));
  }
  const gates = await gatesFor(gated.map(block => byId.get(block.id)!.accessRuleId!));
  const out: Array<T & { gated?: true; gate?: BlockGate }> = [];
  for (const block of blocks) {
    const row = byId.get(block.id);
    if (!row || !isGatedBlock(row)) {
      out.push(block);
      continue;
    }
    // Only a block that would render with its real config is shown locked
    if (!isRenderable({ ...block, order: 0 } as unknown as BlockType)) continue;
    const gate = gates.get(Buffer.from(row.accessRuleId!).toString("hex"));
    if (!gate) continue;
    out.push({
      ...block,
      clicks: 0,
      config: lockedConfig(block.type, block.config as Record<string, unknown> | null),
      gated: true,
      gate,
    });
  }
  return out;
}

import { prisma } from "@repo/database";
import type { MessageRuleKind } from "@repo/constants";
import { messagingEnabled } from "./caps";
import { directSettings } from "./direct";

/**
 * The Message me block's door on a public page (Build Board #2 r4, PR M6, spec 8.4).
 * Open while the creator takes messages from people they don't know yet: the kill
 * switch is off, the page is published and not suspended, the rule is not No one, and
 * inbound messages are not paused. The rule kind lets the page show one line ("Followers
 * and members"); the stake amount never leaves the server. Whether this visitor may
 * write is `messages.canMessage`, asked when they tap.
 */
export type MessageDoor = { open: boolean; ruleKind: MessageRuleKind };

export async function messageDoor(creatorUserId: number): Promise<MessageDoor> {
  const [enabled, user, settings] = await Promise.all([
    messagingEnabled(),
    prisma.user.findUnique({
      where: { id: creatorUserId },
      select: { page_status: true, block: true },
    }),
    directSettings(creatorUserId),
  ]);
  const open =
    enabled &&
    !!user &&
    user.page_status === "PUBLISHED" &&
    user.block === "no" &&
    settings.ruleKind !== "NOBODY" &&
    !settings.paused;
  return { open, ruleKind: settings.ruleKind };
}

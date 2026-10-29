import { useQuery } from "@tanstack/react-query";
import type { DmRuleKind } from "@repo/constants";
import { trpc, type RouterOutputs } from "@repo/ui";
import { MESSAGES_ON } from "./shared";

// Telegram groups (Build Board #2, phase 2): the list query and helpers the group
// card, the wizard, the block row and the preview share.

type GroupList = RouterOutputs["telegram"]["groups"]["list"];
export type TelegramGroupView = Extract<GroupList, { enabled: true }>["groups"][number];

/** The tiles a group offers (board tg5). Members only waits on Memberships. */
export const GROUP_RULE_KINDS = [
  "FOLLOWER",
  "POOL_MEMBER",
  "STAKE_MIN",
] as const satisfies readonly DmRuleKind[];

const LISTEN_MS = 5000;

/** "12 minutes ago" from a date the server sent. */
export function ago(value: string | Date | null | undefined) {
  if (!value) return null;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * The creator's groups. With `listen`, the list refreshes every 5 seconds while no group
 * is connected or one is waiting to be confirmed, so the group the bot finds appears.
 */
export function useTelegramGroups({ listen = false }: { listen?: boolean } = {}) {
  return useQuery({
    ...trpc.telegram.groups.list.queryOptions(),
    enabled: MESSAGES_ON,
    retry: 1,
    refetchInterval: query => {
      const data = query.state.data;
      if (!listen || !data?.enabled) return false;
      const waiting =
        data.groups.every(group => group.state !== "connected") ||
        data.groups.some(group => group.state === "pending");
      return waiting ? LISTEN_MS : false;
    },
  });
}

/** The newest group the bot found that is not connected yet. */
export function pendingGroup(groups: TelegramGroupView[]) {
  return [...groups].reverse().find(group => group.state === "pending") ?? null;
}

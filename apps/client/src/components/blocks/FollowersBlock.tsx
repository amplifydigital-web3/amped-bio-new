import { useQuery } from "@tanstack/react-query";
import type { FollowersBlock as FollowersBlockType } from "@repo/constants";
import { DEFAULT_FOLLOWERS_CONFIG } from "@repo/constants";
import { FollowersCard, trpc, type FollowersCardData } from "@repo/ui";
import type { ThemeConfig } from "../../types/editor";
import { FollowBlock } from "./FollowBlock";

/**
 * The live preview's Followers block (Build Board #30, spec 3.7). The same
 * shared card as the public page, fed by `follow.blockData` for the
 * creator's own handle, so every configurator change shows with live data.
 * Links and the Follow button are inert in the preview (D10). When the read
 * fails, or the page is not published yet so the public procedure has
 * nothing to say, the preview keeps the card with its title and button so
 * the creator still sees the block they placed.
 */

const QUIET: FollowersCardData = {
  showCount: false,
  newOnAmped: false,
  followerCount: null,
  newInRange: null,
  series: null,
  faces: [],
  othersCount: null,
  poolFans: null,
  poolFanShare: null,
  milestone: null,
  sources: null,
  poolAddress: null,
};
export function FollowersBlock({
  block,
  theme,
  handle,
}: {
  block: FollowersBlockType;
  theme: ThemeConfig | undefined;
  handle: string;
}) {
  const config = { ...DEFAULT_FOLLOWERS_CONFIG, ...block.config };
  const { data, isLoading, isError } = useQuery(
    trpc.follow.blockData.queryOptions(
      {
        handle,
        growthRange: config.growthRange,
        facesOrder: config.facesOrder,
        facesMax: config.facesMax,
      },
      { enabled: !!handle, retry: 1, staleTime: 30_000 }
    )
  );

  if (!handle) return null;
  return (
    <FollowersCard
      config={config}
      theme={theme}
      data={isLoading ? null : isError ? QUIET : (data ?? QUIET)}
      followButton={<FollowBlock theme={theme} label="Follow" />}
      renderPoolLink={() => <span className="font-semibold">View pool</span>}
    />
  );
}

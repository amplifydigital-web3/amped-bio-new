"use client";

import { useQuery } from "@tanstack/react-query";
import type { FollowersBlock as FollowersBlockType, ThemeConfig } from "@repo/constants";
import { DEFAULT_FOLLOWERS_CONFIG } from "@repo/constants";
import { FollowersCard, cn } from "@repo/ui";
import { trpc } from "@/lib/trpc";
import { CREATOR_FOCUS } from "./frame";
import { FollowBlock } from "./FollowBlock";

/**
 * Followers block on the public page (Build Board #30, spec 3.5). Reads
 * `follow.blockData`, which already applied the 10 floor, the creator's
 * count setting and the opt-in rule, and hands it to the shared card. A
 * failed read renders nothing to visitors (040 I01).
 */
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
      { retry: 1, staleTime: 60_000 }
    )
  );

  if (isError) return null;
  const linkClass = cn("underline-offset-2 hover:underline", CREATOR_FOCUS);
  return (
    <FollowersCard
      config={config}
      theme={theme}
      data={isLoading ? null : (data ?? null)}
      followButton={<FollowBlock theme={theme} label="Follow" />}
      renderFaceLink={(face, text) =>
        face.handle ? (
          <a href={`/${face.handle}`} className={linkClass}>
            {text}
          </a>
        ) : (
          text
        )
      }
      renderPoolLink={poolAddress => (
        <a href={`/i/pools/${poolAddress}`} className={cn("font-semibold", linkClass)}>
          View pool
        </a>
      )}
    />
  );
}

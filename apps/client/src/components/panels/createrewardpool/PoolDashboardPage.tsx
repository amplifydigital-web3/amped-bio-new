import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChainId, useReadContract } from "wagmi";
import type { Address } from "viem";
import { ExternalLink, Send } from "lucide-react";
import { Button, ErrorCard, trpc } from "@repo/ui";
import { CREATOR_POOL_ABI, getChainConfig } from "@repo/web3";
import { toast } from "@/components/ui/toast";
import { useEditor } from "@/contexts/EditorContext";
import { useDelayed } from "@/hooks/useDelayed";
import { TestnetLine } from "../explore/pool-panel/sections";
import { AboutSection, PoolCard } from "./dashboard/PoolHeader";
import { PoolStats } from "./dashboard/PoolStats";
import { TopFans } from "./dashboard/TopFans";
import { RecentActivity, type ActivityEvent } from "./dashboard/RecentActivity";
import { formatPoolAmount, poolPageUrl } from "./dashboard/format";

// 067 I12: skeleton of row 1 and row 2, shown only after 400ms
function DashboardSkeleton() {
  return (
    <div aria-hidden className="space-y-[21px]">
      <div className="grid gap-[21px] lg:grid-cols-[495px_minmax(0,1fr)]">
        <div className="h-[419px] rounded-prism-21 bg-prism-line" />
        <div className="space-y-[21px]">
          <div className="h-24 rounded-prism-21 bg-prism-line/60" />
          <div className="h-36 rounded-prism-21 bg-prism-line" />
          <div className="h-[55px] w-48 rounded-prism-13 bg-prism-line" />
        </div>
      </div>
    </div>
  );
}

/**
 * Screen Review 067 to 069: My Pool for a creator with a pool. Row 1 is the
 * pool card with About, Pool stats and Share pool; row 2 is Top fans and
 * Recent activity. Each section owns its loading, empty and error states, and
 * everything reads from the pool address, so a failed wallet reconnect never
 * blocks the page (063 D1).
 */
export default function DashboardPage() {
  const chainId = useChainId();
  const chain = getChainConfig(chainId);
  const symbol = chain?.nativeCurrency.symbol ?? "tREVO";
  const explorer = chain?.blockExplorers?.default?.url;
  const { profile } = useEditor();

  const poolQuery = useQuery({
    ...trpc.pools.creator.getPool.queryOptions({ chainId: chainId.toString() }),
    retry: 1,
  });
  const pool = poolQuery.data;
  const poolAddress = pool?.address as Address | undefined;

  const dashboardQuery = useQuery({
    ...trpc.pools.creator.getPoolDashboard.queryOptions({ chainId: chainId.toString() }),
    enabled: !!pool,
    retry: 1,
    // 067: refetch while the reward index catches up
    refetchInterval: query => (query.state.data?.rewardsIndexing ? 5000 : false),
  });

  // 067 I02: Total staked reads the chain (creator stake plus fan stake)
  const read = (functionName: "creatorStaked" | "totalFanStaked" | "creatorCut") =>
    ({
      address: poolAddress,
      abi: CREATOR_POOL_ABI,
      functionName,
      chainId,
      query: { enabled: !!poolAddress },
    }) as const;
  const creatorStaked = useReadContract(read("creatorStaked"));
  const fanStaked = useReadContract(read("totalFanStaked"));
  const creatorCut = useReadContract(read("creatorCut"));

  const chainTotal =
    creatorStaked.data !== undefined && fanStaked.data !== undefined
      ? (creatorStaked.data as bigint) + (fanStaked.data as bigint)
      : undefined;
  const chainFailed = creatorStaked.isError || fanStaked.isError;

  // 067 I18: when the chain read fails, show the recorded total with Updating
  // and try the chain once more after 3 seconds
  const [retried, setRetried] = useState(false);
  useEffect(() => {
    if (!chainFailed || retried) return;
    const timer = setTimeout(() => {
      setRetried(true);
      void creatorStaked.refetch();
      void fanStaked.refetch();
    }, 3000);
    return () => clearTimeout(timer);
  }, [chainFailed, retried, creatorStaked, fanStaked]);

  const showSkeleton = useDelayed(poolQuery.isLoading, 400);
  const activitySkeleton = useDelayed(dashboardQuery.isLoading, 400);

  const content = (() => {
    if (poolQuery.isLoading) return showSkeleton ? <DashboardSkeleton /> : null;
    if (poolQuery.isError || !pool) {
      return (
        <ErrorCard
          title="Your pool did not load"
          cause="Try again in a moment. Your pool and its stakes are unchanged."
          onRetry={() => void poolQuery.refetch()}
          retryLabel="Retry"
          className="!rounded-prism-21"
        />
      );
    }

    const link = poolPageUrl(pool.address);
    const totalStaked =
      chainTotal !== undefined
        ? `${formatPoolAmount(chainTotal)} ${symbol}`
        : dashboardQuery.data
          ? `${formatPoolAmount(dashboardQuery.data.totalStake)} ${symbol}`
          : "…";
    const share = () => {
      if (navigator.share && window.matchMedia?.("(max-width: 639px)").matches) {
        navigator.share({ title: pool.name, url: link }).catch(() => undefined);
        return;
      }
      navigator.clipboard
        .writeText(link)
        .then(() => toast.add({ title: "Link copied", type: "success" }))
        .catch(() => undefined);
    };

    return (
      <div className="space-y-[34px]">
        <div className="grid items-start gap-[21px] lg:grid-cols-[495px_minmax(0,1fr)]">
          <PoolCard
            pool={pool}
            creatorName={profile.name}
            handle={profile.handle}
            avatar={profile.photoUrl}
            fans={dashboardQuery.data?.totalFans ?? pool.fans}
            totalStaked={totalStaked}
            totalNote={chainTotal === undefined && chainFailed ? "Updating" : undefined}
            onImageSaved={() => void poolQuery.refetch()}
          />
          <div className="min-w-0 space-y-[21px]">
            <AboutSection pool={pool} onSaved={() => void poolQuery.refetch()} />
            <PoolStats
              creatorStake={creatorStaked.data as bigint | undefined}
              creatorCutBps={creatorCut.data as bigint | undefined}
              symbol={symbol}
              stats={dashboardQuery.data}
              loading={dashboardQuery.isLoading}
              error={dashboardQuery.isError}
              onRetry={() => void dashboardQuery.refetch()}
            />
            <div className="flex flex-wrap gap-3 max-sm:flex-col">
              <Button type="button" size="lg" onClick={share} className="max-sm:w-full">
                <Send aria-hidden />
                Share pool
              </Button>
              {explorer && (
                <Button asChild variant="ghost" className="prism-glass-clear max-sm:w-full">
                  <a
                    href={`${explorer}/address/${pool.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on explorer
                    <ExternalLink aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
              )}
            </div>
            <div className="max-sm:hidden">
              <TestnetLine />
            </div>
          </div>
        </div>

        <div className="grid items-start gap-[34px] lg:grid-cols-2 lg:gap-[21px]">
          <TopFans chainId={pool.chainId} symbol={symbol} poolLink={link} />
          <RecentActivity
            events={dashboardQuery.data?.recentActivity as ActivityEvent[] | undefined}
            loading={dashboardQuery.isLoading}
            showSkeleton={activitySkeleton}
            error={dashboardQuery.isError}
            onRetry={() => void dashboardQuery.refetch()}
            symbol={symbol}
            explorer={explorer}
            creatorAvatar={profile.photoUrl}
            poolLink={link}
          />
        </div>
        <div className="sm:hidden">
          <TestnetLine />
        </div>
      </div>
    );
  })();

  return (
    <div className="w-full px-[13px] pb-[calc(89px+env(safe-area-inset-bottom,0px))] pt-5 font-prism sm:px-[21px] sm:pb-[34px]">
      {content}
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { getCurrencySymbol } from "@repo/web3";
import { Button, EmptyState, ErrorCard, Skeleton, trpc } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { useEditor } from "@/contexts/EditorContext";
import { useDelayed } from "@/hooks/useDelayed";
import { appChainId } from "@/utils/appChain";
import PoolPanel from "../../explore/pool-panel/PoolPanel";
import { Eyebrow } from "../../explore/pool-panel/sections";
import { formatTokenAmount, toWei } from "../../explore/pool-panel/format";
import { StakeRow } from "./StakeRow";

// Screen Review 059 (D19, D25). Stakes is the second Wallet section: every
// pool the creator has staked in, what is staked and pending in each, and
// Manage to open the pool details panel. The server reads the saved account
// wallet and the app network, so a failed reconnect never shows a false
// No stakes yet (I12).

const FIRST_ROWS = 5;

function RowSkeleton() {
  return (
    <li className="flex h-commit items-center gap-3 border-b border-prism-line last:border-b-0">
      <Skeleton className="h-[34px] w-[34px] rounded-[8px]" />
      <span className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/2 rounded-full" />
        <Skeleton className="h-3 w-1/4 rounded-full" />
      </span>
      <Skeleton className="hidden h-[13px] w-[55px] rounded-full sm:block" />
      <Skeleton className="hidden h-[13px] w-[55px] rounded-full sm:block" />
      <Skeleton className="h-touch w-[89px] rounded-prism-13" />
    </li>
  );
}

export default function StakesCard() {
  const { address } = useWalletContext();
  const { setActivePanelAndNavigate } = useEditor();
  const chainId = appChainId();
  const symbol = getCurrencySymbol(Number(chainId));
  const [expanded, setExpanded] = useState(false);
  const [openPoolId, setOpenPoolId] = useState<number | null>(null);

  const stakes = useQuery({
    ...trpc.pools.fan.getUserStakedPools.queryOptions({ chainId }),
    retry: 1,
  });
  const showSkeleton = useDelayed(stakes.isPending, 400);

  const list = (stakes.data ?? []).filter(stake => (toWei(stake.pool.stakedByYou) ?? 0n) > 0n);
  const total = list.reduce((sum, stake) => sum + (toWei(stake.pool.stakedByYou) ?? 0n), 0n);
  const visible = expanded ? list : list.slice(0, FIRST_ROWS);
  const browsePools = () => setActivePanelAndNavigate("explore", "pools");

  let body: React.ReactNode;
  if (stakes.isPending) {
    body = showSkeleton ? (
      <ul aria-busy aria-label="Loading stakes">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </ul>
    ) : (
      <div className="h-[165px]" aria-hidden />
    );
  } else if (stakes.isError) {
    body = (
      <ErrorCard
        title="Stakes did not load"
        cause="The network did not answer. Check your connection and try again."
        onRetry={() => void stakes.refetch()}
        retryLabel="Retry"
        className="!shadow-none"
      />
    );
  } else if (list.length === 0) {
    body = (
      <EmptyState
        icon={Coins}
        title="No stakes yet"
        description="Back a creator's pool with tREVO."
        action={
          <Button type="button" variant="secondary" onClick={browsePools}>
            Browse pools
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <ul aria-label="Your stakes">
          {visible.map(stake => (
            <StakeRow
              key={stake.pool.id}
              stake={stake}
              symbol={symbol}
              viewer={address ?? undefined}
              onManage={setOpenPoolId}
            />
          ))}
        </ul>
        {list.length > FIRST_ROWS && (
          <Button
            type="button"
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded(current => !current)}
          >
            {expanded ? "Show fewer" : `Show all ${list.length} stakes`}
          </Button>
        )}
      </>
    );
  }

  return (
    <section
      aria-labelledby="wallet-stakes-title"
      className="prism-glass-clear !rounded-prism-21 p-[13px] font-prism sm:p-[21px]"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span id="wallet-stakes-title">
          <Eyebrow>Stakes</Eyebrow>
        </span>
        {list.length > 0 && (
          <span className="text-prism-meta tabular-nums text-prism-ink-2">
            {formatTokenAmount(total)} {symbol} in {list.length}{" "}
            {list.length === 1 ? "pool" : "pools"}
          </span>
        )}
      </div>
      {body}
      {list.length > 0 && (
        <div className="mt-2 border-t border-prism-line pt-2">
          <Button type="button" variant="ghost" onClick={browsePools}>
            Browse reward pools
          </Button>
        </div>
      )}
      <PoolPanel
        open={openPoolId !== null}
        onOpenChange={open => {
          if (!open) setOpenPoolId(null);
        }}
        poolId={openPoolId ?? undefined}
        onChanged={() => void stakes.refetch()}
      />
    </section>
  );
}

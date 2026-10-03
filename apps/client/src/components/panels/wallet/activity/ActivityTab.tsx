import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Clock, Loader2 } from "lucide-react";
import type { Address } from "viem";
import { getChainConfig, getCurrencySymbol } from "@repo/web3";
import { Button, ChipGroup, EmptyState, ErrorCard, Skeleton, trpc } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { useDelayed } from "@/hooks/useDelayed";
import { appChainId } from "@/utils/appChain";
import { useAddressProfiles } from "../hooks/useAddressProfiles";
import type { TransactionsResponse, TransfersResponse } from "../ProfileTabs/types";
import { ActivityRow } from "./ActivityRow";
import {
  STAKING_KINDS,
  fromTransaction,
  fromTransfer,
  mergeByHash,
  type ActivityItem,
} from "./activityModel";

// Screen Review 057, 058 (D19). Transactions and Transfers are one Activity
// tab with the chips All, Transfers and Staking, kept in ?filter=. History
// reads the saved account address, so a failed reconnect never shows a false
// empty list (057 I13, 058 I08).

export type ActivityFilter = "all" | "transfers" | "staking";
const FILTERS: ActivityFilter[] = ["all", "transfers", "staking"];
const PAGE_SIZE = 10;

function useFilter() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("filter");
  const filter = (FILTERS as string[]).includes(raw ?? "") ? (raw as ActivityFilter) : "all";
  const setFilter = (next: ActivityFilter) =>
    setParams(
      current => {
        const updated = new URLSearchParams(current);
        if (next === "all") updated.delete("filter");
        else updated.set("filter", next);
        return updated;
      },
      { replace: true }
    );
  return [filter, setFilter] as const;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Explorer returned ${response.status}`);
  return response.json() as Promise<T>;
}

/** 057 I11: Get tREVO points at the wallet's funding action. */
function focusGetTrevo() {
  const target = document.querySelector<HTMLElement>("[data-get-trevo]");
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  target?.focus({ preventScroll: true });
}

export function ActivityTab() {
  const [filter, setFilter] = useFilter();
  const { address } = useWalletContext();
  const chainId = Number(appChainId());
  const chain = getChainConfig(chainId);
  const nativeSymbol = getCurrencySymbol(chainId);
  const apiUrl = chain?.blockExplorers?.default.apiUrl;
  const explorerUrl = chain?.blockExplorers?.default.url;
  const me = address ?? "";
  // One fixed end time per visit, so pages do not shift while paging
  const [toDate] = useState(() => new Date().toISOString());
  const [openHash, setOpenHash] = useState<string | null>(null);

  const wantTransactions = filter !== "transfers";
  const wantTransfers = filter !== "staking";

  const transactions = useInfiniteQuery({
    queryKey: ["activity", "transactions", apiUrl, me, toDate],
    enabled: !!apiUrl && !!me && wantTransactions,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getJson<TransactionsResponse>(
        `${apiUrl}/transactions?address=${me}&limit=${PAGE_SIZE}&page=${pageParam}&toDate=${encodeURIComponent(toDate)}`
      ),
    getNextPageParam: last =>
      last.meta.currentPage < last.meta.totalPages ? last.meta.currentPage + 1 : undefined,
    retry: 1,
  });

  const transfers = useInfiniteQuery({
    queryKey: ["activity", "transfers", apiUrl, me, toDate],
    enabled: !!apiUrl && !!me && wantTransfers,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getJson<TransfersResponse>(
        `${apiUrl}/address/${me}/transfers?toDate=${encodeURIComponent(toDate)}&limit=${PAGE_SIZE}&page=${pageParam}`
      ),
    getNextPageParam: last =>
      last.meta.currentPage < last.meta.totalPages ? last.meta.currentPage + 1 : undefined,
    retry: 1,
  });

  const txItems = useMemo(
    () =>
      (transactions.data?.pages ?? []).flatMap(page =>
        page.items.map(tx => fromTransaction(tx, me, nativeSymbol))
      ),
    [transactions.data, me, nativeSymbol]
  );
  const transferItems = useMemo(
    () =>
      (transfers.data?.pages ?? []).flatMap(page =>
        page.items.map(transfer => fromTransfer(transfer, me, nativeSymbol))
      ),
    [transfers.data, me, nativeSymbol]
  );

  const items: ActivityItem[] = useMemo(() => {
    if (filter === "transfers") return transferItems;
    // mergeByHash also drops a hash repeated across pages
    if (filter === "staking")
      return mergeByHash(txItems, []).filter(item => STAKING_KINDS.includes(item.kind));
    return mergeByHash(txItems, transferItems);
  }, [filter, txItems, transferItems]);

  // 057 I01: Staking keeps fetching until it holds 10 matches or reaches the end
  const stakingCount = filter === "staking" ? items.length : 0;
  useEffect(() => {
    if (filter !== "staking") return;
    if (stakingCount >= PAGE_SIZE) return;
    if (transactions.hasNextPage && !transactions.isFetchingNextPage && !transactions.isError) {
      void transactions.fetchNextPage();
    }
  }, [filter, stakingCount, transactions]);

  const active = [wantTransactions && transactions, wantTransfers && transfers].filter(Boolean) as (
    | typeof transactions
    | typeof transfers
  )[];
  const loading = active.some(query => query.isPending) || (!me && !address);
  const failed = active.some(query => query.isError) && items.length === 0;
  const hasMore = active.some(query => query.hasNextPage);
  const fetchingMore = active.some(query => query.isFetchingNextPage);
  const showSkeleton = useDelayed(loading, 400);

  const showMore = () => {
    for (const query of active) if (query.hasNextPage) void query.fetchNextPage();
  };
  const retry = () => {
    for (const query of active) void query.refetch();
  };

  // People and pools named in the rows
  const addresses = useMemo(
    () => items.flatMap(item => [item.from, item.to]).filter(Boolean) as Address[],
    [items]
  );
  const { profiles } = useAddressProfiles(addresses);

  const poolAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.poolAddress) set.add(item.poolAddress.toLowerCase());
    return [...set];
  }, [items]);
  const poolQueries = useQueries({
    queries: poolAddresses.map(poolAddress => ({
      ...trpc.pools.fan.getPoolByAddress.queryOptions({ poolAddress }),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const poolNames = useMemo(() => {
    const names: Record<string, string> = {};
    poolQueries.forEach((query, index) => {
      const name = (query.data as { name?: string } | undefined)?.name;
      if (name) names[poolAddresses[index]] = name;
    });
    return names;
  }, [poolQueries, poolAddresses]);

  // The resolved signature shows only inside a Contract call slab (057 I03)
  const selectors = useMemo(
    () => [...new Set(items.map(item => item.selector).filter(Boolean) as string[])],
    [items]
  );
  const methods = useQuery({
    ...trpc.wallet.getMethodSignatures.queryOptions({ selectors }),
    enabled: selectors.length > 0,
    staleTime: Infinity,
  });

  const errorTitle = filter === "transfers" ? "Transfers did not load" : "Activity did not load";

  let body: React.ReactNode;
  if (loading) {
    body = showSkeleton ? (
      <ul aria-busy aria-label="Loading activity">
        {[0, 1, 2, 3, 4].map(index => (
          <li
            key={index}
            className="flex h-commit items-center gap-3 border-b border-prism-line last:border-b-0"
          >
            <Skeleton className="h-[34px] w-[34px] rounded-full" />
            <span className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2 rounded-full" />
              <Skeleton className="h-3 w-1/4 rounded-full" />
            </span>
            <Skeleton className="h-3.5 w-[89px] rounded-full" />
          </li>
        ))}
      </ul>
    ) : (
      <div className="h-[275px]" aria-hidden />
    );
  } else if (failed) {
    body = (
      <ErrorCard
        title={errorTitle}
        cause="The block explorer did not answer. Check your connection and try again."
        onRetry={retry}
        retryLabel="Retry"
        className="!shadow-none"
      />
    );
  } else if (items.length === 0) {
    body =
      filter === "all" ? (
        <EmptyState
          icon={Clock}
          title="No activity yet"
          description="Sent, received and staked tREVO shows here."
          action={
            <Button type="button" variant="secondary" onClick={focusGetTrevo}>
              Get tREVO
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-prism-body text-prism-ink-2">
            {filter === "staking" ? "No staking activity" : "No transfers yet"}
          </p>
          <Button type="button" variant="ghost" onClick={() => setFilter("all")}>
            Show all
          </Button>
        </div>
      );
  } else {
    body = (
      <ul aria-label="Activity">
        {items.map(item => (
          <ActivityRow
            key={item.hash}
            item={item}
            open={openHash === item.hash}
            onToggle={() => setOpenHash(current => (current === item.hash ? null : item.hash))}
            profiles={profiles}
            poolNames={poolNames}
            explorerUrl={explorerUrl}
            nativeSymbol={nativeSymbol}
            method={item.selector ? (methods.data?.[item.selector] ?? null) : null}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-[21px] font-prism">
      <ChipGroup<ActivityFilter>
        label="Show activity"
        value={filter}
        onChange={next => {
          setFilter(next);
          setOpenHash(null);
        }}
        options={[
          { value: "all", label: "All" },
          { value: "transfers", label: "Transfers" },
          { value: "staking", label: "Staking" },
        ]}
      />
      <div className="prism-glass-clear px-[21px] py-2">{body}</div>
      {!loading && !failed && items.length > 0 && hasMore && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            onClick={showMore}
            disabled={fetchingMore}
            aria-busy={fetchingMore}
          >
            {fetchingMore && (
              <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
            )}
            {fetchingMore ? "Loading" : "Show more"}
          </Button>
        </div>
      )}
    </div>
  );
}

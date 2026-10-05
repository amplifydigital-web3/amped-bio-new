"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { trpcClient } from "@/lib/trpc";
import { DEFAULT_POOLS_CHAIN_ID } from "@/lib/getPoolsData";

// Two decimals, rounded (not truncated), with K and M suffixes.
export function formatNetworkTotal(wei: string | undefined): string {
  if (!wei) return "0";
  const value = Number(formatEther(BigInt(wei)));
  const round = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value >= 1_000_000) return `${round(value / 1_000_000)}M`;
  if (value >= 1_000) return `${round(value / 1_000)}K`;
  return round(value);
}

type Totals = { totalStaked: string; totalMinted: string };

// Libertas Testnet totals strip (Screen Review 007 I12, D4 wording). Network
// wide figures named by source, after the testnet notice, never in the
// header. Loading shows skeleton figures after 400ms; a failure renders the
// approved one line message.
export function NetworkTotals() {
  const [data, setData] = useState<Totals | null>(null);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 400);
    trpcClient.pools.fan.getSystemStats
      .query({ chainId: DEFAULT_POOLS_CHAIN_ID })
      .then(result => setData(result as Totals))
      .catch(() => setFailed(true))
      .finally(() => clearTimeout(timer));
    return () => clearTimeout(timer);
  }, []);

  const stats = [
    { label: "Delegated to network nodes", value: data?.totalStaked },
    { label: "Total tREVO supply", value: data?.totalMinted },
  ];

  return (
    <section
      aria-labelledby="network-totals"
      className="prism-glass-clear p-[21px] font-prism"
      aria-busy={!data && !failed}
    >
      <h2
        id="network-totals"
        className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2"
      >
        <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
        Libertas Testnet totals
      </h2>
      {failed ? (
        <p className="mt-[13px] text-prism-body text-prism-ink-2">Network totals did not load.</p>
      ) : (
        <dl className="mt-[13px] grid gap-[21px] sm:grid-cols-2">
          {stats.map(stat => (
            <div key={stat.label}>
              <dt className="text-prism-meta text-prism-ink-2">{stat.label}</dt>
              <dd className="mt-1 flex items-baseline gap-2">
                {data ? (
                  <>
                    <span className="font-prism-display text-prism-display-42 tabular-nums text-prism-ink">
                      {formatNetworkTotal(stat.value)}
                    </span>
                    <span className="text-prism-label font-semibold text-prism-ink-2">tREVO</span>
                  </>
                ) : (
                  <span
                    aria-hidden
                    className={`block h-[34px] w-40 rounded-prism-13 ${slow ? "bg-prism-line" : ""}`}
                  />
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-[13px] text-prism-meta text-prism-ink-2">
        Network wide figures. Not pool balances. Updated every 15 minutes.
      </p>
    </section>
  );
}

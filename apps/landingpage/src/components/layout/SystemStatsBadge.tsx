"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { trpcClient } from "@/lib/trpc";

function formatREVO(wei: string | undefined): string {
  if (!wei) return "0.00";
  const value = Number(BigInt(wei) / BigInt(10 ** 16)) / 100;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

export function SystemStatsBadge() {
  const [data, setData] = useState<{ totalStaked: string; totalMinted: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trpcClient.pools.fan.getSystemStats.query as any)({ chainId: "73863" })
      .then((d: any) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-xs font-medium">
        <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-full text-xs font-medium shadow-sm">
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Staked:</span>
        <span className="text-gray-900 font-semibold">{formatREVO(data.totalStaked)}</span>
      </div>
      <span className="text-gray-300">|</span>
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Minted:</span>
        <span className="text-gray-900 font-semibold">{formatREVO(data.totalMinted)}</span>
      </div>
      <span className="text-blue-600 font-bold">tREVO</span>
    </div>
  );
}

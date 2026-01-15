import { useState, useEffect } from "react";
import { CoinsIcon, Users, DollarSign, ExternalLink, Loader2 } from "lucide-react";
import type { ThemeConfig } from "../../types/editor";
import { PoolBlock } from "@ampedbio/constants";
import { formatNumberWithSeparators } from "@/utils/numberUtils";
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";

interface CreatorPoolBlockProps {
  block: PoolBlock;
  theme: ThemeConfig;
}

interface PoolData {
  id: number;
  name: string;
  description: string | null;
  chainId: string;
  address: string;
  image: {
    id: number;
    url: string;
  } | null;
  stakedAmount: bigint;
  fans: number;
  creatorFee: number;
}

export function CreatorPoolBlock({ block, theme }: CreatorPoolBlockProps) {
  const poolAddress = block.config.address;
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading: isQueryLoading } = useQuery(
    trpc.pools.fan.getPoolByAddress.queryOptions(
      { poolAddress },
      {
        enabled: !!poolAddress && poolAddress.startsWith("0x"),
        retry: 1,
      }
    )
  );

  useEffect(() => {
    if (data) {
      setPoolData(data as PoolData);
      setIsLoading(false);
    }
  }, [data]);

  useEffect(() => {
    if (isQueryLoading) {
      setIsLoading(true);
    } else if (!poolAddress || !poolAddress.startsWith("0x")) {
      setIsLoading(false);
      setError(poolAddress ? "Invalid pool address" : "No pool address configured");
    }
  }, [isQueryLoading, poolAddress]);

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="w-full p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg mb-8">
        <div className="flex items-center justify-center space-x-3">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="text-sm text-gray-400" style={{ fontFamily: theme.fontFamily }}>
            Loading pool data...
          </span>
        </div>
      </div>
    );
  }

  if (error || !poolData) {
    return (
      <div className="w-full p-6 bg-red-500/10 backdrop-blur-md rounded-xl border border-red-500/20 shadow-lg mb-8">
        <div className="flex items-center space-x-3">
          <DollarSign className="w-6 h-6 text-red-400" />
          <div>
            <p
              className="text-sm font-medium text-red-400"
              style={{ fontFamily: theme.fontFamily }}
            >
              {error || "Failed to load pool data"}
            </p>
            <p className="text-xs text-red-400/70 mt-1">
              Please check the pool address in editor settings
            </p>
          </div>
        </div>
      </div>
    );
  }

  const poolUrl = `https://amped.bio/i/pools/${poolData.address}`;

  return (
    <div className="w-full p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          {poolData.image && (
            <img
              src={poolData.image.url}
              alt={poolData.name}
              className="w-12 h-12 rounded-lg object-cover"
            />
          )}
          <div>
            <h3
              className="text-lg font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent"
              style={{ fontFamily: "Montserrat" }}
            >
              {poolData.name}
            </h3>
            <p
              className="text-xs mt-0.5 opacity-80"
              style={{
                fontFamily: theme.fontFamily,
                color: theme.fontColor,
              }}
            >
              {poolData.description || "Stake tokens to earn rewards"}
            </p>
          </div>
        </div>
        <a
          href={poolUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg font-medium"
          style={{ fontFamily: "Montserrat" }}
        >
          Stake in this Pool
        </a>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="flex items-center text-blue-400 mb-2">
            <div className="p-1.5 bg-blue-400/10 rounded-md mr-2">
              <CoinsIcon className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium" style={{ fontFamily: "Montserrat" }}>
              Total Staked
            </span>
          </div>
          <div>
            <p
              className="text-base font-bold"
              style={{
                fontFamily: "Montserrat",
                color: theme.fontColor,
              }}
            >
              {formatNumberWithSeparators(poolData.stakedAmount.toString())}
            </p>
            <div className="flex items-center text-green-400 text-xs">
              <DollarSign className="w-3 h-3 mr-0.5" />
              <span>{formatUSD(Number(poolData.stakedAmount) * 2.34)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="flex items-center text-purple-400 mb-2">
            <div className="p-1.5 bg-purple-400/10 rounded-md mr-2">
              <CoinsIcon className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium" style={{ fontFamily: "Montserrat" }}>
              Creator Fee
            </span>
          </div>
          <div>
            <p
              className="text-base font-bold"
              style={{
                fontFamily: "Montserrat",
                color: theme.fontColor,
              }}
            >
              {poolData.creatorFee / 100}%
            </p>
            <p className="text-xs text-purple-400 mt-1">Pool fee rate</p>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="flex items-center text-blue-400 mb-2">
            <div className="p-1.5 bg-blue-400/10 rounded-md mr-2">
              <Users className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium" style={{ fontFamily: "Montserrat" }}>
              Active Stakers
            </span>
          </div>
          <div>
            <p
              className="text-base font-bold"
              style={{
                fontFamily: "Montserrat",
                color: theme.fontColor,
              }}
            >
              {poolData.fans}
            </p>
            <p className="text-xs text-blue-400 mt-1">Growing community</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <a
          href={poolUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          <span>View Pool Details</span>
          <ExternalLink className="w-4 h-4" />
        </a>
        <p
          className="text-xs opacity-60"
          style={{ fontFamily: theme.fontFamily, color: theme.fontColor }}
        >
          Chain: {poolData.chainId}
        </p>
      </div>
    </div>
  );
}

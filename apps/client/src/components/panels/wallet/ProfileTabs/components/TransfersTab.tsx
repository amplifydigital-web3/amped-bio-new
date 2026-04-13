import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAccount, useChainId } from "wagmi";
import { ArrowLeftRight, Loader, AlertCircle } from "lucide-react";
import { getChainConfig } from "@ampedbio/web3";
import { Address } from "viem";
import { Tooltip } from "@/components/ui/Tooltip";
import RenderAddressProfile from "./RenderAddressProfile";
import { Transfer, TransfersResponse } from "../types";
import { formatHash, timeAgo } from "../utils";
import { useAddressProfiles } from "../../hooks/useAddressProfiles";

const TransfersTab: React.FC = () => {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [transfersError, setTransfersError] = useState<string | null>(null);
  const [transferPage, setTransferPage] = useState(1);
  const [hasMoreTransfers, setHasMoreTransfers] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const { address } = useAccount();
  const chainId = useChainId();

  const chain = getChainConfig(chainId);
  const explorerUrl = chain?.blockExplorers?.default.url;
  const explorerApiUrl = chain?.blockExplorers?.default.apiUrl;

  const formatTransferAmount = (amount: string, decimals: number, symbol: string): string => {
    const value = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const wholePart = value / divisor;
    const fractionalPart = value % divisor;
    const fractionalStr = fractionalPart.toString().padStart(decimals, "0").slice(0, 6);
    return `${wholePart}.${fractionalStr} ${symbol}`;
  };

  const fetchTransfers = useCallback(
    async (walletAddress: string, page: number = 1, append: boolean = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setTransfersLoading(true);
      }
      setTransfersError(null);
      try {
        const now = new Date();
        const toDate = now.toISOString();

        const response = await fetch(
          `${explorerApiUrl}/address/${walletAddress}/transfers?toDate=${encodeURIComponent(toDate)}&limit=10&page=${page}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch transfers");
        }
        const data: TransfersResponse = await response.json();

        if (append) {
          setTransfers(prev => [...prev, ...data.items]);
        } else {
          setTransfers(data.items);
        }

        setHasMoreTransfers(data.meta.currentPage < data.meta.totalPages);
        setTransferPage(page);
      } catch (error) {
        setTransfersError("Could not load transfer history.");
        console.error(error);
      } finally {
        setTransfersLoading(false);
        setLoadingMore(false);
      }
    },
    [explorerApiUrl]
  );

  useEffect(() => {
    if (address && chain) {
      setTransferPage(1);
      setTransfers([]);
      fetchTransfers(address, 1, false);
    }
  }, [address, chainId, fetchTransfers]);

  const loadMoreTransfers = () => {
    if (address && !loadingMore && hasMoreTransfers) {
      fetchTransfers(address, transferPage + 1, true);
    }
  };

  const uniqueAddresses = useMemo(
    () => transfers.flatMap(t => [t.from, t.to]).filter(Boolean) as Address[],
    [transfers]
  );
  const { profiles } = useAddressProfiles(uniqueAddresses);

  if (transfersLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 text-gray-400 animate-spin" />
        <p className="ml-3 text-gray-500">Loading transfer history...</p>
      </div>
    );
  }

  if (transfersError) {
    return (
      <div className="text-center py-12 text-red-600">
        <AlertCircle className="w-12 h-12 mx-auto mb-3" />
        <p>{transfersError}</p>
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="text-center py-12">
        <ArrowLeftRight className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No transfer history found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold text-gray-900">Recent Transfers</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Transaction Hash
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Age
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                From
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                In/Out
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                To
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Token
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transfers.map(transfer => {
              const isIncoming = transfer.to.toLowerCase() === address?.toLowerCase();
              return (
                <tr key={transfer.transactionHash + transfer.blockNumber}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <Tooltip content={transfer.transactionHash}>
                      <a
                        href={`${explorerUrl}/tx/${transfer.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline cursor-pointer"
                      >
                        {formatHash(transfer.transactionHash)}
                      </a>
                    </Tooltip>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {timeAgo(transfer.timestamp)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <RenderAddressProfile
                      address={transfer.from}
                      explorerUrl={explorerUrl!}
                      profile={profiles[transfer.from.toLowerCase()]}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        isIncoming ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {isIncoming ? "IN" : "OUT"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <RenderAddressProfile
                      address={transfer.to}
                      explorerUrl={explorerUrl!}
                      profile={profiles[transfer.to.toLowerCase()]}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatTransferAmount(
                      transfer.amount,
                      transfer.token.decimals,
                      transfer.token.symbol
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center space-x-2">
                      {transfer.token.iconURL && (
                        <img
                          src={transfer.token.iconURL}
                          alt={transfer.token.symbol}
                          className="w-5 h-5 rounded-full"
                        />
                      )}
                      <span>{transfer.token.symbol}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMoreTransfers && (
        <div className="flex justify-center mt-6">
          <button
            onClick={loadMoreTransfers}
            disabled={loadingMore}
            className="inline-flex items-center px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingMore ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default TransfersTab;

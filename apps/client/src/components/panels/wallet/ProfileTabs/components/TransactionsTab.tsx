import React, { useState, useEffect, useCallback } from "react";
import { useAccount, useBalance, useChainId } from "wagmi";
import { Clock, Loader, AlertCircle } from "lucide-react";
import { getChainConfig } from "@ampedbio/web3";
import { Address } from "viem";
import { Tooltip } from "@/components/ui/Tooltip";
import RenderAddressProfile from "./RenderAddressProfile";
import { Transaction, TransactionsResponse } from "../types";
import { formatHash, timeAgo, formatValue, formatFee, getMethodSelector } from "../utils";
import { trpcClient } from "@/utils/trpc";

const TransactionsTab: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [transactionPage, setTransactionPage] = useState(1);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [methodSignatures, setMethodSignatures] = useState<Record<string, string>>({});

  const { address } = useAccount();
  const chainId = useChainId();
  const { data: revoBalance } = useBalance({
    address: address,
  });

  const chain = getChainConfig(chainId);
  const explorerUrl = chain?.blockExplorers?.default.url;
  const explorerApiUrl = chain?.blockExplorers?.default.apiUrl;

  const fetchMethodSignatures = useCallback(
    async (selectors: string[]) => {
      const uncachedSelectors = selectors.filter(s => s && !methodSignatures[s]);
      if (uncachedSelectors.length === 0) return;

      try {
        const result = await trpcClient.wallet.getMethodSignatures.query({
          selectors: uncachedSelectors,
        });
        setMethodSignatures(prev => ({ ...prev, ...result }));
      } catch (error) {
        console.error("Failed to fetch method signatures:", error);
      }
    },
    [methodSignatures]
  );

  const fetchTransactions = useCallback(
    async (walletAddress: string, page: number = 1, append: boolean = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setTransactionsLoading(true);
      }
      setTransactionsError(null);
      try {
        const now = new Date();
        const toDate = now.toISOString();

        const response = await fetch(
          `${explorerApiUrl}/transactions?address=${walletAddress}&limit=10&page=${page}&toDate=${toDate}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch transactions");
        }
        const data: TransactionsResponse = await response.json();

        if (append) {
          setTransactions(prev => [...prev, ...data.items]);
        } else {
          setTransactions(data.items);
        }

        const selectors = data.items
          .map(tx => getMethodSelector(tx.data))
          .filter((s): s is string => s !== null);
        fetchMethodSignatures(selectors);

        setHasMoreTransactions(data.meta.currentPage < data.meta.totalPages);
        setTransactionPage(page);
      } catch (error) {
        setTransactionsError("Could not load transaction history.");
        console.error(error);
      } finally {
        setTransactionsLoading(false);
        setLoadingMore(false);
      }
    },
    [explorerApiUrl, fetchMethodSignatures]
  );

  useEffect(() => {
    if (address && chain) {
      setTransactionPage(1);
      setTransactions([]);
      fetchTransactions(address, 1, false);
    }
  }, [address, chain, fetchTransactions]);

  const loadMoreTransactions = () => {
    if (address && !loadingMore && hasMoreTransactions) {
      fetchTransactions(address, transactionPage + 1, true);
    }
  };

  const getMethodName = (data: string): string => {
    const selector = getMethodSelector(data);
    if (!selector) return "Transfer";
    return methodSignatures[selector] || selector;
  };

  if (transactionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 text-gray-400 animate-spin" />
        <p className="ml-3 text-gray-500">Loading transaction history...</p>
      </div>
    );
  }

  if (transactionsError) {
    return (
      <div className="text-center py-12 text-red-600">
        <AlertCircle className="w-12 h-12 mx-auto mb-3" />
        <p>{transactionsError}</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No transaction history found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold text-gray-900">Recent Transactions</h4>
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
                Method
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fee
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions.map(transaction => {
              const isIncoming = transaction.to.toLowerCase() === address?.toLowerCase();
              return (
                <tr key={transaction.hash}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <Tooltip content={transaction.hash}>
                      <a
                        href={`${explorerUrl}/tx/${transaction.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline cursor-pointer"
                      >
                        {formatHash(transaction.hash)}
                      </a>
                    </Tooltip>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {timeAgo(transaction.receivedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <RenderAddressProfile
                      address={transaction.from as Address}
                      explorerUrl={explorerUrl!}
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
                      address={transaction.to as Address}
                      explorerUrl={explorerUrl!}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                      {getMethodName(transaction.data)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatValue(transaction.value, revoBalance?.symbol)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatFee(transaction.fee, revoBalance?.symbol)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMoreTransactions && (
        <div className="flex justify-center mt-6">
          <button
            onClick={loadMoreTransactions}
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

export default TransactionsTab;

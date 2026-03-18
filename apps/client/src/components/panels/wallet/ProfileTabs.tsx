import React, { useState, useEffect, useMemo } from "react";
import { useAccount, useBalance, useChainId } from "wagmi";
import { Coins, Image, Clock, Plus, Loader, AlertCircle, User } from "lucide-react";
import { Tooltip } from "../../ui/Tooltip";
import NFTModal from "./NFTModal";
import { getChainConfig } from "@ampedbio/web3";
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";

type TabType = "tokens" | "nfts" | "history";

const formatAddress = (address: string) => {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

interface ProfileTabsProps {
  isEmpty?: boolean;
  loading?: boolean;
  onNavigateToExplore?: (tab?: "creators" | "pools" | "nfts") => void;
}

interface NFT {
  id: string;
  name: string;
  collection: string;
  image: string;
  floorPrice: number;
  tokenId?: string;
  description?: string;
}

interface Transaction {
  hash: string;
  to: string;
  from: string;
  data: string;
  value: string;
  isL1Originated: boolean;
  fee: string;
  nonce: number;
  gasLimit: string;
  gasPrice: string;
  gasPerPubdata: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  blockNumber: number;
  l1BatchNumber: number;
  blockHash: string;
  type: number;
  transactionIndex: number;
  receivedAt: string;
  error: string | null;
  revertReason: string | null;
  status: "included" | "pending" | "failed";
  commitTxHash: string | null;
  executeTxHash: string | null;
  proveTxHash: string | null;
  isL1BatchSealed: boolean;
  gasUsed: string;
  contractAddress: string | null;
}

interface TransactionsMeta {
  totalItems: number;
  itemCount: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
}

interface TransactionsLinks {
  first: string;
  previous: string;
  next: string;
  last: string;
}

interface TransactionsResponse {
  items: Transaction[];
  meta: TransactionsMeta;
  links: TransactionsLinks;
}

const RenderAddressProfile: React.FC<{ address: Address; explorerUrl: string }> = ({
  address,
  explorerUrl,
}) => {
  const { data } = useQuery(trpc.wallet.getUserByAddress.queryOptions({ address }));
  const currentUrl = window.location.origin;

  if (!data?.handle) {
    return (
      <Tooltip content={address}>
        <a
          href={`${explorerUrl}/address/${address}#transactions`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline cursor-pointer"
        >
          {formatAddress(address)}
        </a>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={data.handle}>
      <a
        href={`${currentUrl}/@${data.handle}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline cursor-pointer flex items-center"
      >
        {data.image ? (
          <img
            src={data.image}
            alt="User Avatar"
            className="w-6 h-6 rounded-full mr-2 object-cover"
          />
        ) : (
          <div className="w-6 h-6 rounded-full mr-2 bg-gray-200 flex items-center justify-center">
            <User className="w-4 h-4 text-gray-400" />
          </div>
        )}
        @{data.handle}
      </a>
    </Tooltip>
  );
};

export default function ProfileTabs({ isEmpty = false, loading = false }: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("tokens");
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [isNFTModalOpen, setIsNFTModalOpen] = useState(false);
  const [currentTokenPage, setCurrentTokenPage] = useState(1);
  const [currentNFTPage, setCurrentNFTPage] = useState(1);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [transactionPage, setTransactionPage] = useState(1);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [methodSignatures, setMethodSignatures] = useState<Record<string, string>>({});
  const tokensPerPage = 3;
  const nftsPerPage = 4;

  const { address } = useAccount();
  const chainId = useChainId();
  const { data: revoBalance, isLoading: isRevoBalanceLoading } = useBalance({
    address: address,
  });

  const chain = useMemo(() => {
    return getChainConfig(chainId);
  }, [chainId]);

  const explorerUrl = chain?.blockExplorers?.default.url;
  const explorerApiUrl = chain?.blockExplorers?.default.apiUrl;

  useEffect(() => {
    if (activeTab === "history" && address && chain && !loading) {
      setTransactionPage(1);
      setTransactions([]);
      fetchTransactions(address, 1, false);
    }
  }, [activeTab, address, revoBalance, chain, loading]);

  const fetchTransactions = async (
    walletAddress: string,
    page: number = 1,
    append: boolean = false
  ) => {
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
  };

  const loadMoreTransactions = () => {
    if (address && !loadingMore && hasMoreTransactions) {
      fetchTransactions(address, transactionPage + 1, true);
    }
  };

  const getMethodSelector = (data: string): string | null => {
    if (!data || data === "0x" || data.length < 10) return null;
    return data.substring(0, 10);
  };

  const fetchMethodSignatures = async (selectors: string[]) => {
    const uncachedSelectors = selectors.filter(s => s && !methodSignatures[s]);
    if (uncachedSelectors.length === 0) return;

    try {
      const response = await fetch(
        `https://api.openchain.xyz/signature-database/v1/lookup?function=${uncachedSelectors.join(",")}&filter=true`
      );
      if (!response.ok) return;

      const data = await response.json();
      if (data.ok && data.result?.function) {
        const newSignatures: Record<string, string> = {};
        for (const [selector, signatures] of Object.entries(data.result.function)) {
          if (Array.isArray(signatures) && signatures.length > 0) {
            const sig = signatures[0] as { name: string };
            newSignatures[selector] = sig.name;
          }
        }
        setMethodSignatures(prev => ({ ...prev, ...newSignatures }));
      }
    } catch (error) {
      console.error("Failed to fetch method signatures:", error);
    }
  };

  const getMethodName = (data: string): string => {
    const selector = getMethodSelector(data);
    if (!selector) return "Transfer";
    return methodSignatures[selector] || selector;
  };

  const formatHash = (hash: string) => {
    if (!hash) return "";
    return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
  };

  const timeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return `${Math.floor(interval)} years ago`;
    interval = seconds / 2592000;
    if (interval > 1) return `${Math.floor(interval)} months ago`;
    interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)} days ago`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)} hours ago`;
    interval = seconds / 60;
    if (interval > 1) return `${Math.floor(interval)} minutes ago`;
    return `${Math.floor(seconds)} seconds ago`;
  };

  const formatValue = (value: string) => {
    try {
      const ethValue = parseFloat(value) / Math.pow(10, 18);
      return `${ethValue.toFixed(4)} ${revoBalance?.symbol}`;
    } catch (e) {
      return "N/A";
    }
  };

  const formatFee = (fee: string) => {
    try {
      const feeValue = fee.startsWith("0x") ? parseInt(fee, 16) : parseFloat(fee);
      const ethValue = feeValue / Math.pow(10, 18);
      return `${ethValue.toFixed(6)} ${revoBalance?.symbol || "REVO"}`;
    } catch (e) {
      return "N/A";
    }
  };

  const tabs = [
    { id: "tokens" as TabType, label: "Tokens", icon: Coins },
    { id: "nfts" as TabType, label: "NFTs", icon: Image, disabled: true },
    { id: "history" as TabType, label: "Transaction History", icon: Clock },
  ];

  const renderLoadingSkeleton = () => {
    switch (activeTab) {
      case "tokens":
        return (
          <div className="py-6">
            <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse"></div>
            <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-gray-200 rounded animate-pulse"></div>
                <div>
                  <div className="h-4 bg-gray-200 rounded w-12 mb-2 animate-pulse"></div>
                  <div className="h-3 bg-gray-200 rounded w-40 animate-pulse"></div>
                </div>
              </div>
              <div className="text-right">
                <div className="h-4 bg-gray-200 rounded w-24 mb-2 animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded w-16 animate-pulse"></div>
              </div>
            </div>
          </div>
        );

      case "nfts":
        return (
          <div className="py-6">
            <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4">
                  <div className="w-full h-32 bg-gray-200 rounded mb-3 animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2 animate-pulse"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
        );

      case "history":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="h-6 bg-gray-200 rounded w-40 animate-pulse"></div>
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
                  {Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="h-5 bg-gray-200 rounded-full w-8 animate-pulse"></div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      default:
        return (
          <div className="py-12">
            <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4 animate-pulse"></div>
            <div className="h-6 bg-gray-200 rounded w-48 mx-auto mb-2 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-64 mx-auto mb-6 animate-pulse"></div>
            <div className="h-10 bg-gray-200 rounded w-32 mx-auto animate-pulse"></div>
          </div>
        );
    }
  };

  const renderEmptyState = () => (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Coins className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Your account is empty</h3>
      <p className="text-gray-500 mb-6 max-w-sm mx-auto">
        Get started by funding your account or receiving tokens from other users.
      </p>
      <button className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200">
        <Plus className="w-4 h-4" />
        <span>Fund Account</span>
      </button>
    </div>
  );

  const renderTokens = () => {
    if (isRevoBalanceLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 text-gray-400 animate-spin" />
          <p className="ml-3 text-gray-500">Loading REVO balance...</p>
        </div>
      );
    }

    if (!revoBalance) {
      return (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Coins className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No REVO balance found</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">
            Your REVO token balance will appear here.
          </p>
        </div>
      );
    }

    return (
      <div className="py-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Your Tokens</h4>
        <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Coins className="w-6 h-6 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">REVO</p>
              <p className="text-xs text-gray-500">Revolution Chain Native Token</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">
              {parseFloat(revoBalance.formatted).toFixed(4)} {revoBalance.symbol}
            </p>
            <p className="text-xs text-gray-500">
              {/* You can add a USD value here if you have a price feed */}
              $0.00 USD
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderNFTs = () => (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Image className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">No NFTs found</h3>
      <p className="text-gray-500 mb-6 max-w-sm mx-auto">
        Your NFT collection will appear here once you have NFTs.
      </p>
    </div>
  );

  const renderHistory = () => {
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
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Transaction Hash
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Age
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  From
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  In/Out
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  To
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Method
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Value
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
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
                      {formatValue(transaction.value)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatFee(transaction.fee)}
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

  const renderContent = () => {
    if (loading) {
      return renderLoadingSkeleton();
    }

    if (isEmpty) {
      return renderEmptyState();
    }

    switch (activeTab) {
      case "tokens":
        return renderTokens();
      case "nfts":
        return renderNFTs();
      case "history":
        return renderHistory();
      default:
        return null;
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 overflow-x-auto">
          <nav
            className="flex space-x-4 sm:space-x-8 px-4 sm:px-6 min-w-max sm:min-w-0"
            aria-label="Tabs"
          >
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => !tab.disabled && !loading && setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors duration-200 touch-manipulation ${
                    isActive
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  } ${tab.disabled || loading ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={tab.disabled || loading}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">{renderContent()}</div>
      </div>

      {/* NFT Modal */}
      <NFTModal
        isOpen={isNFTModalOpen}
        onClose={() => setIsNFTModalOpen(false)}
        nft={selectedNFT}
      />
    </>
  );
}

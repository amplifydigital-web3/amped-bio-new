import { Tooltip } from "@/components/ui/Tooltip";
import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Search,
  Send,
  Users,
  Clock,
  QrCode,
  Scan,
  User,
  X,
  Loader,
  AlertCircle,
} from "lucide-react";
import { trpc } from "@/utils/trpc/trpc";
import { useQuery } from "@tanstack/react-query";
import ReceiveDialog from "../wallet/dialogs/ReceiveDialog";
import PayModal from "./dialogs/PayDialog";
import usePayDialog from "@/hooks/usePayDialog";
import { Scanner as QRScanner } from "@yudiel/react-qr-scanner";
import { Address, isAddress } from "viem";
import { useChainId, useAccount } from "wagmi";
import { getChainConfig } from "@ampedbio/web3";

interface Transaction {
  from: string;
  to: string;
  hash: string;
  value: string;
  gasPrice: string;
  method: string;
  receivedAt: string; // 2025-07-23T19:27:58.807Z
}

export default function PayPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<"people" | "recent">("people");
  const payDialog = usePayDialog();

  // Debounce search query
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  // Custom debounce hook
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Check if the debounced search query is a valid Ethereum address
  useEffect(() => {
    if (debouncedSearchQuery && isAddress(debouncedSearchQuery)) {
      payDialog.openPayDialog(debouncedSearchQuery as Address);
      setSearchQuery(""); // Clear the search query after opening the dialog
    }
  }, [debouncedSearchQuery, payDialog]);

  // Update the query options to use debounced search query
  const {
    data: filteredUsers,
    isLoading,
    isError,
  } = useQuery(
    trpc.wallet.searchUsers.queryOptions(debouncedSearchQuery, {
      enabled: debouncedSearchQuery.length > 0,
    })
  );

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

  const chainId = useChainId();
  const { address } = useAccount();

  const chain = useMemo(() => {
    return getChainConfig(chainId);
  }, [chainId]);

  const explorerApiUrl = chain?.blockExplorers?.default.apiUrl;
  const explorerUrl = chain?.blockExplorers?.default.url;

  useEffect(() => {
    if (selectedTab === "recent" && address && explorerApiUrl) {
      fetchTransactions(address);
    }
  }, [selectedTab, address, explorerApiUrl]);

  const fetchTransactions = async (walletAddress: string) => {
    setTransactionsLoading(true);
    setTransactionsError(null);
    try {
      const now = new Date();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);

      const toDate = now.toISOString();
      const fromDate = sevenDaysAgo.toISOString();

      const response = await fetch(
        `${explorerApiUrl}/transactions?address=${walletAddress}&limit=10&page=1&toDate=${toDate}&fromDate=${fromDate}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch transactions");
      }
      const data = await response.json();
      setTransactions(data.items);
    } catch (error) {
      setTransactionsError("Could not load transaction history.");
      console.error(error);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

  const formatValue = (value: string, symbol: string) => {
    try {
      const ethValue = parseFloat(value) / Math.pow(10, 18);
      return `${ethValue.toFixed(4)} ${symbol}`;
    } catch (e) {
      return "N/A";
    }
  };

  const renderPeopleTab = () => {
    if (isLoading) {
      return <div className="text-center text-gray-500 py-8">Searching for users...</div>;
    }

    if (isError) {
      return (
        <div className="text-center text-red-500 py-8">Error loading users. Please try again.</div>
      );
    }

    if (!filteredUsers || filteredUsers.length === 0) {
      return <div className="text-center text-gray-500 py-8">No users found.</div>;
    }

    return (
      <div className="space-y-4">
        {filteredUsers.map(user => (
          <div
            key={user.id}
            className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition-colors"
          >
            <div className="flex items-center space-x-4">
              <div className="relative">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.displayName}
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="w-6 h-6 text-gray-500" />
                  </div>
                )}
                {/* <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div> */}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <a
                    href={`/@${user.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    @{user.username}
                  </a>
                </div>
                {user.walletAddress && (
                  <Tooltip content={<p>{user.walletAddress}</p>}>
                    <a
                      href={`${chain?.blockExplorers.default.url}/address/${user.walletAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-500 mt-1 hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      {formatAddress(user.walletAddress)}
                    </a>
                  </Tooltip>
                )}
              </div>
            </div>
            <button
              onClick={() => payDialog.openPayDialog(user.walletAddress)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors flex items-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>Pay</span>
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderRecentTab = () => {
    // Filtrar apenas transações do tipo OUT (enviadas)
    const outTransactions = transactions.filter(
      transaction => transaction.from.toLowerCase() === address?.toLowerCase()
    );

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

    if (outTransactions.length === 0) {
      return (
        <div className="text-center py-12">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No recent transactions found.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {outTransactions.map(transaction => (
          <PayRow
            key={transaction.hash}
            transaction={transaction}
            explorerUrl={explorerUrl}
            formatAddress={formatAddress}
            timeAgo={timeAgo}
            formatValue={formatValue}
            chain={chain}
            payDialog={payDialog}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Pay</h1>
        <p className="text-gray-600">Send tokens and NFTs to friends</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <button
          className="flex items-center justify-center space-x-2 p-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-colors"
          onClick={() => setShowQrScanner(true)}
        >
          <QrCode className="w-5 h-5" />
          <span className="font-medium">Scan QR</span>
        </button>
        <button
          className="flex items-center justify-center space-x-2 p-4 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl transition-colors"
          onClick={() => setShowReceiveModal(true)}
        >
          <Scan className="w-5 h-5" />
          <span className="font-medium">My QR</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search people or paste address..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-gray-50 border-0 rounded-xl text-lg focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
        />
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
        <button
          onClick={() => setSelectedTab("people")}
          className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg font-medium transition-colors ${
            selectedTab === "people"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>People</span>
        </button>
        <button
          onClick={() => setSelectedTab("recent")}
          className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg font-medium transition-colors ${
            selectedTab === "recent"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Recent</span>
        </button>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {selectedTab === "people" && renderPeopleTab()}
        {selectedTab === "recent" && renderRecentTab()}
      </div>

      {/* Pay Modal */}
      <PayModal hook={payDialog} />

      <ReceiveDialog open={showReceiveModal} onOpenChange={setShowReceiveModal} />

      {showQrScanner && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="relative bg-white p-4 rounded-lg shadow-lg max-w-sm w-full">
            <button
              onClick={() => setShowQrScanner(false)}
              className="absolute top-2 right-2 text-gray-600 hover:text-gray-900"
            >
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-semibold mb-4 text-center">Scan QR Code</h2>
            <QRScanner
              onScan={result => {
                const scannedText = result.at(0)?.rawValue ?? "";
                if (isAddress(scannedText)) {
                  payDialog.openPayDialog(scannedText as Address);
                  setShowQrScanner(false);
                } else {
                  alert("Invalid Ethereum address scanned.");
                }
              }}
              onError={error => {
                const err = error as Error;
                console.error(err?.message);
                alert("Error scanning QR code. Please try again.");
                setShowQrScanner(false);
              }}
            />
            <p className="text-center text-sm text-gray-500 mt-4">
              Position the QR code within the frame.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const PayRow: React.FC<{
  transaction: Transaction;
  explorerUrl: string | undefined;
  formatAddress: (address: string) => string;
  timeAgo: (timestamp: string) => string;
  formatValue: (value: string, symbol: string) => string;
  chain: any;
  payDialog: ReturnType<typeof usePayDialog>;
}> = ({ transaction, explorerUrl, formatAddress, timeAgo, formatValue, chain, payDialog }) => {
  const { data } = useQuery(trpc.wallet.getUserByAddress.queryOptions({ address: transaction.to }));

  const currentUrl = window.location.origin;

  return (
    <div
      key={transaction.hash}
      className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition-colors"
    >
      <div className="flex items-center space-x-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
            {data?.image ? (
              <img
                src={data.image}
                alt="User Avatar"
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="w-6 h-6 text-gray-500" />
              </div>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center bg-red-500">
            <Send className="w-3 h-3 text-white" />
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-gray-900">Paid to</span>
            <Tooltip content={transaction.to}>
              <span>
                {data?.onelink && (
                  <>
                    <a
                      href={`${currentUrl}/@${data.onelink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      @{data.onelink}
                    </a>{" "}
                  </>
                )}
                <a
                  href={`${explorerUrl}/address/${transaction.to}#transactions`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline cursor-pointer"
                  onClick={e => e.stopPropagation()}
                >
                  {formatAddress(transaction.to)}
                </a>
              </span>
            </Tooltip>
          </div>
          <div className="text-sm text-gray-600">
            <span>{timeAgo(transaction.receivedAt)}</span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-semibold text-red-600">
          -{formatValue(transaction.value, chain?.nativeCurrency.symbol || "REVO")}
        </div>
        <button
          onClick={() => payDialog.openPayDialog(transaction.to as Address)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Pay again
        </button>
      </div>
    </div>
  );
};

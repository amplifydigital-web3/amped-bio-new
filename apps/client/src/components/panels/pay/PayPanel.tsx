import { Tooltip } from "@/components/ui/Tooltip";
import { useMemo, useState } from "react";
import {
  Search,
  Send,
  Users,
  Clock,
  QrCode,
  Scan,
  User,
  X,
} from "lucide-react";
import { trpc } from "@/utils/trpc/trpc";
import { useQuery } from "@tanstack/react-query";
import ReceiveDialog from "../wallet/dialogs/ReceiveDialog";
import PayModal from "./dialogs/PayDialog";
import usePayDialog from "@/hooks/usePayDialog";
import { Scanner as QRScanner } from "@yudiel/react-qr-scanner";
import { Address, isAddress } from "viem";
import { useChainId } from "wagmi";
import { getChainConfig } from "@ampedbio/web3";

export default function PayPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<"people" | "recent">("people");
  const payDialog = usePayDialog();

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);

  const chainId = useChainId();

  const chain = useMemo(() => {
    return getChainConfig(chainId);
  }, [chainId]);

  const {
    data: filteredUsers,
    isLoading,
    isError,
  } = useQuery(
    trpc.wallet.searchUsers.queryOptions(searchQuery, { enabled: searchQuery.length > 0 })
  );

  // Mock recent transactions (keep for now, as the request only specified searchUsers)
  // const recentTransactions: Transaction[] = [];

  const formatAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

  const renderRecentTab = () => (
    <div className="space-y-4">
      {/* {recentTransactions.map(transaction => (
        <div
          key={transaction.id}
          className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition-colors"
        >
          <div className="flex items-center space-x-4">
            <div className="relative">
              {transaction.user.avatar ? (
                <img
                  src={transaction.user.avatar}
                  alt={transaction.user.displayName}
                  className="w-12 h-12 rounded-full"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="w-6 h-6 text-gray-500" />
                </div>
              )}
              <div
                className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center ${
                  transaction.type === "sent" ? "bg-red-500" : "bg-green-500"
                }`}
              >
                {transaction.type === "sent" ? (
                  <ArrowRight className="w-3 h-3 text-white" />
                ) : (
                  <ArrowRight className="w-3 h-3 text-white rotate-180" />
                )}
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-900">
                  {transaction.type === "sent" ? "Paid" : "Received from"}{" "}
                  {transaction.user.displayName}
                </span>
                {transaction.user.verified && <Verified className="w-4 h-4 text-blue-500" />}
              </div>
              <div className="text-sm text-gray-600">
                {transaction.note && <span>"{transaction.note}" • </span>}
                <span>{transaction.timestamp}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div
              className={`font-semibold ${
                transaction.type === "sent" ? "text-red-600" : "text-green-600"
              }`}
            >
              {transaction.type === "sent" ? "-" : "+"}
              {transaction.amount} {transaction.currency}
            </div>
            <button
              onClick={() => payDialog.openPayDialog()}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Pay again
            </button>
          </div>
        </div>
      ))} */}
    </div>
  );

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
          placeholder="Search people..."
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

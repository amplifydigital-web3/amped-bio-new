import React, { useState } from "react";
import {
  Search,
  Send,
  Users,
  Clock,
  Verified,
  ArrowRight,
  QrCode,
  Scan,
  X,
  Check,
  User, // Added User icon
} from "lucide-react";
import { trpc } from "@/utils/trpc/trpc"; // Import tRPC client
import { useQuery } from "@tanstack/react-query";
import ReceiveDialog from "../wallet/dialogs/ReceiveDialog";

interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  verified: boolean;
  mutualFriends: number;
  lastActive: string;
  bio?: string;
  badges?: string[];
}

interface Transaction {
  id: string;
  type: "sent" | "received";
  user: User;
  amount: number;
  currency: string;
  note: string;
  timestamp: string;
  status: "completed" | "pending";
}

interface PayModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

function PayModal({ isOpen, onClose, user }: PayModalProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<"REVO" | "ETH" | "NFT">("REVO");
  const [step, setStep] = useState<"amount" | "confirm" | "sending" | "success">("amount");

  if (!isOpen || !user) return null;

  const handleSend = () => {
    setStep("sending");
    setTimeout(() => {
      setStep("success");
      setTimeout(() => {
        onClose();
        setStep("amount");
        setAmount("");
        setNote("");
      }, 2000);
    }, 1500);
  };

  const renderAmountStep = () => (
    <>
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900">Send to {user.displayName}</h2>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* User Info */}
        <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-xl">
          {user.avatar ? (
            <img src={user.avatar} alt={user.displayName} className="w-12 h-12 rounded-full" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="w-6 h-6 text-gray-500" />
            </div>
          )}
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-gray-900">{user.displayName}</span>
              {user.verified && <Verified className="w-4 h-4 text-blue-500" />}
            </div>
            <span className="text-sm text-gray-600">@{user.username}</span>
          </div>
        </div>

        {/* Asset Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Select Asset</label>
          <div className="grid grid-cols-3 gap-3">
            {(["REVO", "ETH", "NFT"] as const).map(asset => {
              const isSoon = asset === "ETH" || asset === "NFT";
              return (
                <button
                  key={asset}
                  onClick={() => !isSoon && setSelectedAsset(asset)}
                  disabled={isSoon}
                  className={`relative p-3 rounded-lg border-2 transition-colors flex flex-col items-center ${
                    selectedAsset === asset && !isSoon
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300"
                  } ${isSoon ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <div className="text-lg mb-1">
                    {asset === "REVO" ? "🚀" : asset === "ETH" ? "⟠" : "🖼️"}
                  </div>
                  <div className="text-sm font-medium">{asset}</div>
                  {isSoon && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full flex items-center">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Amount Input */}
        {selectedAsset !== "NFT" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 text-2xl font-bold text-center border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                {selectedAsset}
              </div>
            </div>
          </div>
        )}

        {/* NFT Selection */}
        {selectedAsset === "NFT" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Select NFT</label>
            <div className="grid grid-cols-3 gap-3 max-h-48 overflow-y-auto">
              {[1, 2, 3, 4, 5, 6].map(nft => (
                <button
                  key={nft}
                  className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-500 transition-colors"
                >
                  <img
                    src={`https://images.pexels.com/photos/118146${nft}/pexels-photo-118146${nft}.jpeg?auto=compress&cs=tinysrgb&w=200`}
                    alt={`NFT ${nft}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Note */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center space-x-2">
            <span>Note (optional)</span>
            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full flex items-center">
              Soon
            </span>
          </label>
          <input
            disabled
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What's this for?"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Send Button */}
        <button
          onClick={() => setStep("confirm")}
          disabled={selectedAsset !== "NFT" && !amount}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors"
        >
          Continue
        </button>
      </div>
    </>
  );

  const renderConfirmStep = () => (
    <>
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900">Confirm Payment</h2>
        <button onClick={() => setStep("amount")} className="p-2 hover:bg-gray-100 rounded-full">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div className="text-center py-8">
          <div className="text-4xl font-bold text-gray-900 mb-2">
            {selectedAsset === "NFT" ? "1 NFT" : `${amount} ${selectedAsset}`}
          </div>
          <div className="text-gray-600">to {user.displayName}</div>
          {note && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">"{note}"</div>
            </div>
          )}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={() => setStep("amount")}
            className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </>
  );

  const renderSendingStep = () => (
    <div className="p-6 text-center py-16">
      <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-6"></div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">Sending...</h3>
      <p className="text-gray-600">Processing your payment</p>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="p-6 text-center py-16">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <Check className="w-8 h-8 text-green-600" />
      </div>
      <h3 className="text-xl font-semibold text-green-900 mb-2">Sent!</h3>
      <p className="text-gray-600">Payment sent to {user.displayName}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden">
        {step === "amount" && renderAmountStep()}
        {step === "confirm" && renderConfirmStep()}
        {step === "sending" && renderSendingStep()}
        {step === "success" && renderSuccessStep()}
      </div>
    </div>
  );
}

export default function PayPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<"people" | "recent">("people");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);

  const [showReceiveModal, setShowReceiveModal] = useState(false);

  const {
    data: filteredUsers,
    isLoading,
    isError,
  } = useQuery(
    trpc.wallet.searchUsers.queryOptions(searchQuery, { enabled: searchQuery.length > 0 })
  );

  // Mock recent transactions (keep for now, as the request only specified searchUsers)
  const recentTransactions: Transaction[] = [];

  const handlePayUser = (user: User) => {
    setSelectedUser(user);
    setIsPayModalOpen(true);
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
                  <img src={user.avatar} alt={user.displayName} className="w-12 h-12 rounded-full" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="w-6 h-6 text-gray-500" />
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-gray-900">{user.displayName}</span>
                  {user.verified && <Verified className="w-4 h-4 text-blue-500" />}
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <span>@{user.username}</span>
                  {user.mutualFriends > 0 && (
                    <>
                      <span>•</span>
                      <span>{user.mutualFriends} mutual</span>
                    </>
                  )}
                </div>
                {user.bio && <p className="text-sm text-gray-500 mt-1">{user.bio}</p>}
                {user.badges && (
                  <div className="flex space-x-1 mt-2">
                    {user.badges.map(badge => (
                      <span
                        key={badge}
                        className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => handlePayUser(user)}
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
      {recentTransactions.map(transaction => (
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
              onClick={() => handlePayUser(transaction.user)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Pay again
            </button>
          </div>
        </div>
      ))}
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
        <button className="flex items-center justify-center space-x-2 p-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-colors">
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
      <PayModal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        user={selectedUser}
      />

      <ReceiveDialog open={showReceiveModal} onOpenChange={setShowReceiveModal} />
    </div>
  );
}

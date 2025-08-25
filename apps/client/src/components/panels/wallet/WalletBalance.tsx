import { Plus, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import React, { useState } from "react";
import FundWalletDialog from "./dialogs/FundWalletDialog";
import ReceiveDialog from "./dialogs/ReceiveDialog";
import { useWalletContext } from "@/contexts/WalletContext";
import PayModal from "../pay/dialogs/PayDialog";
import usePayDialog from "@/hooks/usePayDialog";

type WalletBalanceProps = {
  loading?: boolean;
};

const WalletBalance: React.FC<WalletBalanceProps> = ({ loading = false }) => {
  const wallet = useWalletContext();
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);

  const payDialogHook = usePayDialog();

  // Skeleton Loading State
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 animate-pulse">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 space-y-2 sm:space-y-0">
          <div className="h-6 w-32 bg-gray-200 rounded"></div>
          <div className="flex items-center space-x-3">
            <div className="h-4 w-12 bg-gray-200 rounded"></div>
            <div className="h-6 w-11 bg-gray-200 rounded-full"></div>
            <div className="h-4 w-8 bg-gray-200 rounded"></div>
          </div>
        </div>

        {/* Balance Display Skeleton */}
        <div className="mb-4 sm:mb-6">
          <div className="h-8 sm:h-10 w-48 bg-gray-200 rounded mb-2"></div>
        </div>

        {/* Action Buttons Skeleton */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="flex flex-col items-center justify-center p-2 sm:p-3 bg-gray-100 rounded-lg">
            <div className="w-4 h-4 sm:w-5 sm:h-5 mb-1 bg-gray-200 rounded"></div>
            <div className="h-3 w-8 bg-gray-200 rounded"></div>
          </div>
          <div className="flex flex-col items-center justify-center p-2 sm:p-3 bg-gray-100 rounded-lg">
            <div className="w-4 h-4 sm:w-5 sm:h-5 mb-1 bg-gray-200 rounded"></div>
            <div className="h-3 w-8 bg-gray-200 rounded"></div>
          </div>
          <div className="flex flex-col items-center justify-center p-2 sm:p-3 bg-gray-100 rounded-lg">
            <div className="w-4 h-4 sm:w-5 sm:h-5 mb-1 bg-gray-200 rounded"></div>
            <div className="h-3 w-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  // Normal Component Render
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 space-y-2 sm:space-y-0">
        <h3 className="text-lg font-semibold text-gray-900">Wallet Balance</h3>
        <div className="flex items-center space-x-3">
          <span
            className={`text-sm font-medium transition-colors duration-200 ${!wallet.isUSD ? "text-purple-600" : "text-gray-500"}`}
          >
            REVO
          </span>
          <button
            onClick={() => wallet.setIsUSD(!wallet.isUSD)}
            className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 hover:bg-gray-300"
            title={`Switch to ${wallet.isUSD ? "REVO" : "USD"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${
                wallet.isUSD ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium transition-colors duration-200 ${wallet.isUSD ? "text-green-600" : "text-gray-500"}`}
          >
            USD
          </span>
        </div>
      </div>

      {/* Balance Display */}
      <div className="mb-4 sm:mb-6">
        <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
          {wallet.balance?.isLoading
            ? "Loading..."
            : wallet.isUSD
              ? `$${(parseFloat(wallet.balance?.data?.formatted ?? "0") * 2.5).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `${parseFloat(wallet.balance?.data?.formatted ?? "0").toFixed(4)} ${wallet.balance?.data?.symbol ?? "REVO"}`}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <button
          onClick={() => setShowFundModal(true)}
          className="flex flex-col items-center justify-center p-2 sm:p-3 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors duration-200 group touch-manipulation"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5 mb-1 group-hover:scale-110 transition-transform duration-200" />
          <span className="text-xs sm:text-sm font-medium">Fund</span>
        </button>

        <button
          onClick={() => payDialogHook.openPayDialog()}
          className="flex flex-col items-center justify-center p-2 sm:p-3 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg transition-colors duration-200 group touch-manipulation"
        >
          <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 mb-1 group-hover:scale-110 transition-transform duration-200" />
          <span className="text-xs sm:text-sm font-medium">Send</span>
        </button>

        <button
          onClick={() => setShowReceiveModal(true)}
          className="flex flex-col items-center justify-center p-2 sm:p-3 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg transition-colors duration-200 group touch-manipulation"
        >
          <ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5 mb-1 group-hover:scale-110 transition-transform duration-200" />
          <span className="text-xs sm:text-sm font-medium">Receive</span>
        </button>
      </div>

      <FundWalletDialog
        open={showFundModal}
        onOpenChange={setShowFundModal}
        openReceiveModal={() => setShowReceiveModal(true)}
      />

      <PayModal hook={payDialogHook} />

      <ReceiveDialog open={showReceiveModal} onOpenChange={setShowReceiveModal} />
    </div>
  );
};

export default WalletBalance;

import React from "react";
import { useChainId } from "wagmi";
import { getCurrencySymbol } from "@ampedbio/web3";
import { Coins, Loader } from "lucide-react";
import { useWalletContext } from "@/contexts/WalletContext";

const TokensTab: React.FC = () => {
  const chainId = useChainId();
  const currencySymbol = getCurrencySymbol(chainId);
  const { balance } = useWalletContext();

  if (balance?.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 text-gray-400 animate-spin" />
        <p className="ml-3 text-gray-500">Loading {currencySymbol} balance...</p>
      </div>
    );
  }

  if (!balance?.data?.formatted) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Coins className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No {currencySymbol} balance found</h3>
        <p className="text-gray-500 mb-6 max-w-sm mx-auto">
          Your {currencySymbol} token balance will appear here.
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
            <p className="text-sm font-medium text-gray-900">{currencySymbol}</p>
            <p className="text-xs text-gray-500">Revolution Chain Native Token</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">
            {parseFloat(balance.data!.formatted).toFixed(4)} {currencySymbol}
          </p>
          <p className="text-xs text-gray-500">$0.00 USD</p>
        </div>
      </div>
    </div>
  );
};

export default TokensTab;

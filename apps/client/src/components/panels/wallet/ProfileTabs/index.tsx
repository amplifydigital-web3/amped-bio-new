import React, { useState } from "react";
import { Coins, Image, Clock, ArrowLeftRight } from "lucide-react";
import NFTModal from "../NFTModal";
import { TabType, ProfileTabsProps, NFT } from "./types";
import TokensTab from "./components/TokensTab";
import NFTsTab from "./components/NFTsTab";
import TransactionsTab from "./components/TransactionsTab";
import TransfersTab from "./components/TransfersTab";
import TabSkeletons, { EmptyState } from "./TabSkeletons";

const tabs = [
  { id: "tokens" as TabType, label: "Tokens", icon: Coins },
  { id: "nfts" as TabType, label: "NFTs", icon: Image, disabled: true },
  { id: "transactions" as TabType, label: "Transactions", icon: Clock },
  { id: "transfers" as TabType, label: "Transfers", icon: ArrowLeftRight },
];

export default function ProfileTabs({ isEmpty = false, loading = false }: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("tokens");
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [isNFTModalOpen, setIsNFTModalOpen] = useState(false);

  const renderContent = () => {
    if (loading) {
      return <TabSkeletons activeTab={activeTab} />;
    }

    if (isEmpty) {
      return <EmptyState />;
    }

    switch (activeTab) {
      case "tokens":
        return <TokensTab />;
      case "nfts":
        return <NFTsTab />;
      case "transactions":
        return <TransactionsTab />;
      case "transfers":
        return <TransfersTab />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
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

        <div className="p-4 sm:p-6">{renderContent()}</div>
      </div>

      <NFTModal
        isOpen={isNFTModalOpen}
        onClose={() => setIsNFTModalOpen(false)}
        nft={selectedNFT}
      />
    </>
  );
}

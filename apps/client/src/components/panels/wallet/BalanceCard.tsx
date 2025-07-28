import React, { useState } from "react";
import {
  Coins,
  Image,
  Clock,
  Plus,
  TrendingUp,
  TrendingDown,
  Eye,
  Palette,
  Search,
} from "lucide-react";
import NFTModal from "./NFTModal";

type TabType = "tokens" | "nfts" | "history";

interface ProfileTabsProps {
  isEmpty?: boolean;
  onNavigateToExplore?: (tab?: "creators" | "pools" | "nfts") => void;
}

interface Token {
  symbol: string;
  name: string;
  balance: number;
  value: number;
  change: number;
  changePercentage: number;
  icon: string;
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

export default function ProfileTabs({ isEmpty = false, onNavigateToExplore }: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("tokens");
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [isNFTModalOpen, setIsNFTModalOpen] = useState(false);
  const [currentTokenPage, setCurrentTokenPage] = useState(1);
  const [currentNFTPage, setCurrentNFTPage] = useState(1);
  const tokensPerPage = 3;
  const nftsPerPage = 4;

  const mockTokens: Token[] = [
    {
      symbol: "REVO",
      name: "Revolution Token",
      balance: 15420.5,
      value: 7710.25,
      change: 234.5,
      changePercentage: 3.14,
      icon: "🚀",
    },
    {
      symbol: "ETH",
      name: "Ethereum",
      balance: 2.847,
      value: 8541.0,
      change: -127.3,
      changePercentage: -1.47,
      icon: "⟠",
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      balance: 5000.0,
      value: 5000.0,
      change: 0.0,
      changePercentage: 0.0,
      icon: "💵",
    },
    {
      symbol: "BTC",
      name: "Bitcoin",
      balance: 0.125,
      value: 5625.0,
      change: 89.5,
      changePercentage: 1.62,
      icon: "₿",
    },
    {
      symbol: "MATIC",
      name: "Polygon",
      balance: 2847.3,
      value: 2561.57,
      change: -45.2,
      changePercentage: -1.73,
      icon: "🔷",
    },
    {
      symbol: "LINK",
      name: "Chainlink",
      balance: 156.75,
      value: 3134.25,
      change: 67.8,
      changePercentage: 2.21,
      icon: "🔗",
    },
  ];

  const mockNFTs: NFT[] = [
    {
      id: "1",
      name: "Cosmic Ape #1247",
      collection: "Cosmic Apes",
      image:
        "https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=300",
      floorPrice: 0.85,
      tokenId: "1247",
      description:
        "A rare cosmic ape from the depths of space, featuring unique stellar patterns and cosmic energy.",
    },
    {
      id: "2",
      name: "Digital Punk #892",
      collection: "Digital Punks",
      image:
        "https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=300",
      floorPrice: 1.2,
      tokenId: "892",
      description: "A rebellious digital punk with cybernetic enhancements and neon aesthetics.",
    },
    {
      id: "3",
      name: "Meta Bird #456",
      collection: "Meta Birds",
      image:
        "https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=300",
      floorPrice: 0.65,
      tokenId: "456",
      description: "A majestic meta bird soaring through digital realms with iridescent feathers.",
    },
    {
      id: "4",
      name: "Cyber Cat #789",
      collection: "Cyber Cats",
      image:
        "https://images.pexels.com/photos/1181248/pexels-photo-1181248.jpeg?auto=compress&cs=tinysrgb&w=300",
      floorPrice: 0.42,
      tokenId: "789",
      description: "A sleek cyber cat with advanced AI capabilities and holographic fur patterns.",
    },
  ];

  const tabs = [
    { id: "tokens" as TabType, label: "Tokens", icon: Coins },
    { id: "nfts" as TabType, label: "NFTs", icon: Image },
    { id: "history" as TabType, label: "Transaction History", icon: Clock },
  ];

  const handleNFTClick = (nft: NFT) => {
    setSelectedNFT(nft);
    setIsNFTModalOpen(true);
  };

  const handleCreateNFTs = () => {
    console.log("Create NFTs clicked");
    // Implementation for NFT creation flow
  };

  const handleExploreNFTs = () => {
    if (onNavigateToExplore) {
      onNavigateToExplore("nfts");
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

  const renderTokens = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 space-y-2 sm:space-y-0">
        <h4 className="text-lg font-semibold text-gray-900">Token Holdings</h4>
        <div className="flex items-center justify-between sm:justify-end space-x-4">
          <span className="text-sm text-gray-500">{mockTokens.length} tokens</span>
          <span className="text-sm text-gray-500">
            Page {currentTokenPage} of {Math.ceil(mockTokens.length / tokensPerPage)}
          </span>
        </div>
      </div>

      {mockTokens
        .slice((currentTokenPage - 1) * tokensPerPage, currentTokenPage * tokensPerPage)
        .map((token, index) => {
          const isPositive = token.change >= 0;
          return (
            <div
              key={index}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
            >
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-lg font-semibold shadow-sm">
                  {token.icon}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-gray-900">{token.symbol}</span>
                    <span className="text-sm text-gray-500">{token.name}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {token.balance.toLocaleString()} {token.symbol}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-semibold text-gray-900">
                  $
                  {token.value.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div
                  className={`flex items-center justify-end space-x-1 text-sm ${isPositive ? "text-green-600" : "text-red-600"}`}
                >
                  {isPositive ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  <span>
                    {isPositive ? "+" : ""}${Math.abs(token.change).toFixed(2)} (
                    {token.changePercentage > 0 ? "+" : ""}
                    {token.changePercentage.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          );
        })}

      {/* Token Pagination */}
      {mockTokens.length > tokensPerPage && (
        <div className="flex items-center justify-center space-x-2 mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={() => setCurrentTokenPage(prev => Math.max(prev - 1, 1))}
            disabled={currentTokenPage === 1}
            className={`px-3 py-2 rounded-lg font-medium transition-colors duration-200 text-sm ${
              currentTokenPage === 1
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Previous
          </button>

          {Array.from(
            { length: Math.ceil(mockTokens.length / tokensPerPage) },
            (_, i) => i + 1
          ).map(page => (
            <button
              key={page}
              onClick={() => setCurrentTokenPage(page)}
              className={`w-10 h-10 rounded-lg font-medium transition-colors duration-200 text-sm ${
                currentTokenPage === page
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {page}
            </button>
          ))}

          <button
            onClick={() =>
              setCurrentTokenPage(prev =>
                Math.min(prev + 1, Math.ceil(mockTokens.length / tokensPerPage))
              )
            }
            disabled={currentTokenPage === Math.ceil(mockTokens.length / tokensPerPage)}
            className={`px-3 py-2 rounded-lg font-medium transition-colors duration-200 text-sm ${
              currentTokenPage === Math.ceil(mockTokens.length / tokensPerPage)
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );

  const renderNFTs = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold text-gray-900">NFT Collection</h4>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">{mockNFTs.length} items</span>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCreateNFTs}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2 text-sm"
            >
              <Palette className="w-4 h-4" />
              <span>Create NFTs</span>
            </button>
            <button
              onClick={handleExploreNFTs}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2 text-sm"
            >
              <Search className="w-4 h-4" />
              <span>Explore NFTs</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {mockNFTs
          .slice((currentNFTPage - 1) * nftsPerPage, currentNFTPage * nftsPerPage)
          .map(nft => (
            <div
              key={nft.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200 relative group cursor-pointer"
              onClick={() => handleNFTClick(nft)}
            >
              <div className="aspect-square relative">
                <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" />

                {/* Hover Overlay with View NFT Button */}
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button className="px-4 py-2 bg-white text-gray-900 rounded-lg font-medium hover:bg-gray-100 transition-colors duration-200 flex items-center space-x-2">
                    <Eye className="w-4 h-4" />
                    <span>View NFT</span>
                  </button>
                </div>
              </div>

              <div className="p-3">
                <h5 className="font-semibold text-gray-900 text-sm truncate">{nft.name}</h5>
                <p className="text-xs text-gray-500 mb-2">{nft.collection}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Floor</span>
                  <span className="text-sm font-semibold text-gray-900">{nft.floorPrice} ETH</span>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* NFT Pagination */}
      {Math.ceil(mockNFTs.length / nftsPerPage) > 1 && (
        <div className="flex items-center justify-center space-x-2 mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={() => setCurrentNFTPage(prev => Math.max(prev - 1, 1))}
            disabled={currentNFTPage === 1}
            className={`px-3 py-2 rounded-lg font-medium transition-colors duration-200 text-sm ${
              currentNFTPage === 1
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Previous
          </button>

          {Array.from({ length: Math.ceil(mockNFTs.length / nftsPerPage) }, (_, i) => i + 1).map(
            page => (
              <button
                key={page}
                onClick={() => setCurrentNFTPage(page)}
                className={`w-10 h-10 rounded-lg font-medium transition-colors duration-200 text-sm ${
                  currentNFTPage === page
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {page}
              </button>
            )
          )}

          <button
            onClick={() =>
              setCurrentNFTPage(prev =>
                Math.min(prev + 1, Math.ceil(mockNFTs.length / nftsPerPage))
              )
            }
            disabled={currentNFTPage === Math.ceil(mockNFTs.length / nftsPerPage)}
            className={`px-3 py-2 rounded-lg font-medium transition-colors duration-200 text-sm ${
              currentNFTPage === Math.ceil(mockNFTs.length / nftsPerPage)
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );

  const renderHistory = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-lg font-semibold text-gray-900">Recent Transactions</h4>
      </div>
      <div className="text-center py-8">
        <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Transaction history will appear here</p>
      </div>
    </div>
  );

  const renderContent = () => {
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
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 whitespace-nowrap py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors duration-200 touch-manipulation ${
                    isActive
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
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

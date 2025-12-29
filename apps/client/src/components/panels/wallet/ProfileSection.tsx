import { useState, useRef, useEffect } from "react";
import { Copy, Check, User, Globe, ChevronDown } from "lucide-react";
import { useChainId } from "wagmi";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Suspense } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useEditor } from "@/contexts/EditorContext";
import { StatsSection } from "./StatsSection";
import { type StatBoxProps } from "./types";
import { AVAILABLE_CHAINS } from "@ampedbio/web3";
import { Chain } from "viem";

interface ProfileSectionProps {
  address?: string;
  walletStats: StatBoxProps[];
  onProfileOptionsClick: () => void;
  loading?: boolean;
}

interface ChainInfo extends Chain {
  color: string;
  dotColor: string;
  bgColor: string;
  description: string;
}

const getChainInfo = (chain: Chain): ChainInfo => {
  switch (chain.id) {
    case 73861: // Revolution Devnet
      return {
        ...chain,
        color: "text-orange-600",
        dotColor: "bg-orange-500",
        bgColor: "bg-orange-100",
        description: "For testing and development",
      };
    case 73863: // Libertas Testnet
      return {
        ...chain,
        color: "text-blue-600",
        dotColor: "bg-blue-500",
        bgColor: "bg-blue-100",
        description: "Libertas test network",
      };
    default:
      return {
        ...chain,
        color: "text-gray-600",
        dotColor: "bg-gray-600",
        bgColor: "bg-gray-100",
        description: "Unknown network",
      };
  }
};

export function ProfileSection({
  address,
  walletStats,
  onProfileOptionsClick,
  loading = false,
}: ProfileSectionProps) {
  const { authUser } = useAuth();
  const { profile } = useEditor();
  const [copyStatus, setCopyStatus] = useState<"idle" | "success">("idle");
  const [revoNameCopyStatus, setRevoNameCopyStatus] = useState<"idle" | "success">("idle");
  const chainId = useChainId();
  const [currentNetwork, setCurrentNetwork] = useState<Chain>(AVAILABLE_CHAINS[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (chainId) {
      const connectedChain = AVAILABLE_CHAINS.find(availableChain => availableChain.id === chainId);
      if (connectedChain) {
        setCurrentNetwork(connectedChain);
      }
    }
  }, [chainId]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const handleNetworkSwitch = (network: Chain) => {
    setCurrentNetwork(network);
    setDropdownOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Check screen size
  useEffect(() => {
    const checkScreenSize = () => {
      // 640px is the default sm breakpoint in Tailwind
      setIsSmallScreen(window.innerWidth <= 640);
    };

    // Initial check
    checkScreenSize();

    // Add event listener for window resize
    window.addEventListener("resize", checkScreenSize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", checkScreenSize);
    };
  }, []);

  const formatAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyAddress = () => {
    if (address && !loading) {
      navigator.clipboard.writeText(address);
      setCopyStatus("success");
      setTimeout(() => {
        setCopyStatus("idle");
      }, 1000);
    }
  };

  const copyRevoName = () => {
    if (profile?.revoName && !loading) {
      navigator.clipboard.writeText(profile.revoName);
      setRevoNameCopyStatus("success");
      setTimeout(() => {
        setRevoNameCopyStatus("idle");
      }, 1000);
    }
  };

  const currentNetworkInfo = getChainInfo(currentNetwork);

  if (loading) {
    return (
      <Card className="bg-gray-50 rounded-2xl border border-gray-200 shadow-sm relative mt-16">
        <CardContent className={`p-6 ${isSmallScreen ? "pt-20" : ""}`}>
          {/* Profile Header Skeleton */}
          <div className="flex items-start justify-between mb-4 sm:mb-6">
            {/* User Info Skeleton */}
            <div className="flex-1 min-w-0">
              <div className="h-6 bg-gray-300 rounded-lg mb-2 w-32 animate-pulse"></div>
              <div className="flex items-center space-x-2">
                <div className="h-8 bg-gray-300 rounded-full w-28 animate-pulse"></div>
                <div className="h-8 w-8 bg-gray-300 rounded-lg animate-pulse"></div>
              </div>
            </div>

            {/* Center Avatar Skeleton */}
            <div className="flex-none">
              <div className="h-32 w-32 bg-gray-300 rounded-full absolute -top-16 left-1/2 -translate-x-1/2 shadow-md animate-pulse border-4 border-white"></div>
            </div>

            {/* Network Switcher and Settings Skeleton */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              <div className="h-10 w-24 bg-gray-300 rounded-lg animate-pulse"></div>
              <div className="h-10 w-10 bg-gray-300 rounded-lg animate-pulse"></div>
            </div>
          </div>

          {/* Stats Section Skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="bg-white p-4 rounded-xl border border-gray-200">
                <div className="h-4 bg-gray-300 rounded w-16 mb-2 animate-pulse"></div>
                <div className="h-6 bg-gray-300 rounded w-12 animate-pulse"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-50 rounded-2xl border border-gray-200 shadow-sm relative mt-16">
      <CardContent className={`p-6 ${isSmallScreen ? "pt-20" : ""}`}>
        {/* Profile Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6">
          {/* User Info (Left) */}
          <div className="flex-1 min-w-0">
            <h1
              className="text-lg sm:text-xl font-bold text-gray-900 mb-1 truncate cursor-pointer"
              onClick={onProfileOptionsClick}
            >
              @{authUser?.onelink || "User"}
            </h1>
            <div className="flex items-center space-x-2 min-w-0">
              <span
                className="text-xs sm:text-sm font-mono text-gray-600 bg-white px-2 sm:px-3 py-1 rounded-full border border-gray-200 truncate"
                title={address || ""}
              >
                {formatAddress(address || "")}
              </span>
              <button
                onClick={copyAddress}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors duration-200 flex-shrink-0"
                title="Copy full wallet address"
                disabled={loading}
              >
                {copyStatus === "idle" ? (
                  <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
                )}
              </button>
            </div>
            {profile.revoName && (
              <div className="flex items-center space-x-2 min-w-0">
                <span className="text-xs sm:text-sm font-mono text-gray-600 bg-white px-2 sm:px-3 py-1 rounded-full border border-gray-200 truncate">
                  {profile.revoName}
                </span>
                <button
                  onClick={copyRevoName}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors duration-200 flex-shrink-0"
                  title="Copy full wallet address"
                  disabled={loading}
                >
                  {revoNameCopyStatus === "idle" ? (
                    <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  ) : (
                    <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Center Avatar (Hidden from flex, positioned absolutely) */}
          <div className="flex-none">
            <Avatar
              className="h-32 w-32 cursor-pointer border-4 border-white rounded-full absolute -top-16 left-1/2 -translate-x-1/2 shadow-md"
              onClick={onProfileOptionsClick}
            >
              <AvatarImage src={profile.photoUrl || profile.photoCmp || ""} alt="Profile" />
              <AvatarFallback>
                <User className="w-16 h-16 text-gray-300" />
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Network Switcher and Settings */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            {/* Network Switcher */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => !loading && setDropdownOpen(!dropdownOpen)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors duration-200 ${currentNetworkInfo.bgColor} border-gray-200 hover:shadow-sm ${
                  loading ? "opacity-50 cursor-not-allowed" : ""
                }`}
                title="Switch network"
                disabled={loading}
              >
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${currentNetworkInfo.dotColor}`}></div>
                  <Globe className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${currentNetworkInfo.color}`} />
                  <span
                    className={`text-xs sm:text-sm font-medium ${currentNetworkInfo.color} hidden sm:inline`}
                  >
                    {currentNetworkInfo.name}
                  </span>
                </div>
                <ChevronDown
                  className={`w-3 h-3 sm:w-4 sm:h-4 ${
                    currentNetworkInfo.color
                  } transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Network Dropdown */}
              {dropdownOpen && !loading && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)}></div>

                  {/* Dropdown Menu */}
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                    {AVAILABLE_CHAINS.map(network => {
                      const networkInfo = getChainInfo(network);
                      const isActive = currentNetwork.id === network.id;

                      return (
                        <button
                          key={network.id}
                          onClick={() => handleNetworkSwitch(network)}
                          className={`w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors duration-200 ${
                            isActive ? "bg-gray-50" : ""
                          }`}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full ${networkInfo.dotColor}`}></div>
                          <Globe className={`w-4 h-4 ${networkInfo.color}`} />
                          <div className="flex-1">
                            <div className={`font-medium ${networkInfo.color}`}>
                              {networkInfo.name}
                            </div>
                            <div className="text-xs text-gray-500">{networkInfo.description}</div>
                          </div>
                          {isActive && <Check className="w-4 h-4 text-green-600" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Settings Button */}
            {/* <button
              onClick={onProfileOptionsClick}
              className={`p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors duration-200 flex-shrink-0 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Wallet Settings"
              aria-label="Profile Settings"
              disabled={loading}
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </button> */}
          </div>
        </div>

        {/* Stats Section below */}
        <Suspense
          fallback={
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 opacity-50">
              Loading stats...
            </div>
          }
        >
          <StatsSection stats={walletStats} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

import { lazy, Suspense, useEffect, useState, useMemo } from "react";
import { AUTH_STORAGE_KEYS } from "@/constants/auth-storage";
import {
  Wallet,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Info,
  Trophy,
  Coins,
  TrendingUp,
  Gift,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GridPattern } from "@/components/ui/grid-pattern";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { ProfileSection } from "./ProfileSection";
import { cn } from "@/lib/utils";
import { useWeb3Auth, useWeb3AuthConnect } from "@web3auth/modal/react";
import { useAccount, useBalance } from "wagmi";
import { useWalletContext } from "@/contexts/WalletContext";
import { type StatBoxProps } from "./types";

const StakedPoolsSection = lazy(() => import("./StakedPoolsSection"));
const BalanceCard = lazy(() => import("./BalanceCard"));
const FundWalletDialog = lazy(() => import("./dialogs/FundWalletDialog"));
const ProfileOptionsDialog = lazy(() => import("./dialogs/ProfileOptionsDialog"));
const ReceiveDialog = lazy(() => import("./dialogs/ReceiveDialog"));
const SendDialog = lazy(() => import("./dialogs/SendDialog"));

export function MyWalletPanel() {
  const { isConnected, loading: connectLoading, error: connectError } = useWeb3AuthConnect();
  const dataWeb3Auth = useWeb3Auth();
  const { address } = useAccount();
  const walletContext = useWalletContext();

  useEffect(() => {
    uiConsole("Web3Auth Status:", {
      isConnected: dataWeb3Auth?.isConnected,
      isInitialized: dataWeb3Auth?.isInitialized,
      isInitializing: dataWeb3Auth?.isInitializing,
      status: dataWeb3Auth?.status,
      initError: dataWeb3Auth?.initError,
    });
  }, [dataWeb3Auth]);

  // Add effect to wait for proper initialization
  useEffect(() => {
    const checkInitialization = () => {
      if (dataWeb3Auth?.isInitialized && dataWeb3Auth?.web3Auth && !dataWeb3Auth?.isInitializing) {
        uiConsole("Web3Auth is fully initialized and ready");
      } else if (dataWeb3Auth?.initError) {
        uiConsole("Web3Auth initialization failed:", dataWeb3Auth.initError);
      } else if (dataWeb3Auth?.isInitializing) {
        uiConsole("Web3Auth is still initializing...");
      } else if (!dataWeb3Auth?.isInitialized) {
        uiConsole("Web3Auth is not yet initialized");
      }
    };

    checkInitialization();
  }, [
    dataWeb3Auth?.isInitialized,
    dataWeb3Auth?.isInitializing,
    dataWeb3Auth?.web3Auth,
    dataWeb3Auth?.initError,
  ]);

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showProfileOptions, setShowProfileOptions] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isUSD, setIsUSD] = useState(false);

  const { data: balanceData, isLoading: isBalanceLoading } = useBalance({
    address: address,
  });

  // Demo data
  const demoData = {
    address: "0x742d35Cc6634C0532925a3b8D2aEd3C5c9B3c3f8",
    balance: "1.2847",
    symbol: "REVO",
    tokens: [
      {
        id: "1",
        name: "Revo",
        symbol: "REVO",
        balance: "1.2847",
        value: "$3,241.20",
        icon: "⟠",
      },
      {
        id: "2",
        name: "USD Coin",
        symbol: "USDC",
        balance: "500.00",
        value: "$500.00",
        icon: "💵",
      },
    ],
    nfts: [
      {
        id: "1",
        name: "Bored Ape #1234",
        collection: "Bored Ape Yacht Club",
        image: "https://via.placeholder.com/300x300/4f46e5/white?text=NFT",
      },
      {
        id: "2",
        name: "CryptoPunk #5678",
        collection: "CryptoPunks",
        image: "https://via.placeholder.com/300x300/7c3aed/white?text=NFT",
      },
    ],
    transactions: [
      {
        id: "1",
        type: "received",
        amount: "0.5 REVO",
        value: "$1,250.00",
        from: "0x1234567890abcdef1234567890abcdef12345678",
        to: "0x742d35Cc6634C0532925a3b8D2aEd3C5c9B3c3f8",
        hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        status: "completed",
      },
      {
        id: "2",
        type: "sent",
        amount: "0.2 REVO",
        value: "$500.00",
        from: "0x742d35Cc6634C0532925a3b8D2aEd3C5c9B3c3f8",
        to: "0x9876543210fedcba9876543210fedcba98765432",
        hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        status: "completed",
      },
    ],
  };

  function uiConsole(...args: any[]): void {
    console.log(...args);
  }

  const handleSendTransaction = (address: string, amount: string) => {
    uiConsole("Transaction sent successfully:", { to: address, amount });
  };

  // Get current data (demo or real)
  const currentBalance = isDemoMode ? demoData.balance : balanceData?.formatted;
  const currentSymbol = isDemoMode ? demoData.symbol : balanceData?.symbol;
  const currentIsBalanceLoading = isDemoMode ? false : isBalanceLoading;

  // Unconnected view
  const unloggedInView = (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-6">
        <div className="relative mb-8">
          <GridPattern
            squares={[
              [4, 4],
              [5, 1],
              [8, 2],
              [5, 3],
              [10, 6],
              [12, 3],
              [2, 8],
              [15, 5],
            ]}
            className={cn(
              "absolute inset-0 h-full w-full fill-blue-400/20 stroke-blue-400/20 text-blue-400/30",
              "[mask-image:radial-gradient(300px_circle_at_center,white,transparent)]"
            )}
            width={25}
            height={25}
          />
          <div className="relative z-10">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Wallet className="w-12 h-12 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Connect Your Wallet</h1>
            <p className="text-gray-600 mb-8">
              Connect your wallet to access your digital assets, tokens, and transaction history.
            </p>
            <div className="space-y-4">
              <ShimmerButton
                className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 px-8 py-3 text-lg"
                shimmerColor="#60a5fa"
                onClick={() => walletContext.connect()}
                disabled={
                  connectLoading ||
                  dataWeb3Auth?.isInitializing ||
                  !dataWeb3Auth?.isInitialized ||
                  !dataWeb3Auth?.web3Auth ||
                  !localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)
                }
              >
                {connectLoading || walletContext.connecting
                  ? "Connecting..."
                  : dataWeb3Auth?.isInitializing
                    ? "Initializing..."
                    : !dataWeb3Auth?.isInitialized
                      ? "Waiting for initialization..."
                      : !dataWeb3Auth?.web3Auth
                        ? "Loading Web3Auth..."
                        : !localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)
                          ? "Please login first"
                          : "Connect Wallet"}
              </ShimmerButton>

              <div className="flex items-center space-x-2">
                <div className="flex-1 h-px bg-gray-200"></div>
                <span className="text-sm text-gray-500">or</span>
                <div className="flex-1 h-px bg-gray-200"></div>
              </div>

              <Button
                onClick={() => setIsDemoMode(true)}
                variant="outline"
                className="w-full py-2 text-sm bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"
              >
                View Demo
              </Button>
            </div>

            {connectError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{connectError.message}</p>
              </div>
            )}

            {dataWeb3Auth?.initError ? (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">
                  Initialization Error:{" "}
                  {(dataWeb3Auth.initError as Error)?.message || String(dataWeb3Auth.initError)}
                </p>
              </div>
            ) : null}

            {/* Debug dataWeb3Auth */}
            <div className="mt-6 text-left">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Debug - Web3Auth Status:</h3>
              <pre className="bg-gray-100 p-3 rounded-lg text-xs overflow-auto max-h-48 border text-gray-800">
                {JSON.stringify(
                  {
                    isConnected: dataWeb3Auth?.isConnected,
                    isInitialized: dataWeb3Auth?.isInitialized,
                    isInitializing: dataWeb3Auth?.isInitializing,
                    status: dataWeb3Auth?.status,
                    initError: dataWeb3Auth?.initError
                      ? (dataWeb3Auth.initError as Error)?.message || String(dataWeb3Auth.initError)
                      : null,
                    web3Auth: dataWeb3Auth?.web3Auth ? "Web3Auth instance present" : null,
                    provider: dataWeb3Auth?.provider ? "Provider instance present" : null,
                    connectLoading,
                    connectError: connectError?.message || null,
                    hasAuthToken: !!localStorage.getItem("amped-bio-auth-token"),
                    authTokenPreview:
                      localStorage.getItem("amped-bio-auth-token")?.substring(0, 20) + "..." ||
                      null,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Create stats for the wallet stats section
  const walletStats = useMemo<StatBoxProps[]>(
    () => [
      {
        icon: TrendingUp,
        label: "Total REVO",
        value: `${parseFloat(balanceData?.formatted ?? "0").toFixed(4)} ${balanceData?.symbol ?? "REVO"}`,
        tooltip: "Total amount of REVO tokens in your wallet",
        color: "bg-blue-100 text-blue-600",
        soon: false,
      },
      {
        icon: Coins,
        label: "My Stake",
        value: "8,750 REVO",
        tooltip: "Total amount of REVO tokens you have staked across all pools",
        color: "bg-green-100 text-green-600",
        soon: true,
      },
      {
        icon: Users,
        label: "Staked to Me",
        value: "15,420 REVO",
        tooltip: "Total amount of REVO staked in pools you have created",
        color: "bg-purple-100 text-purple-600",
        soon: true,
      },
      {
        icon: Gift,
        label: "Earnings to Date",
        value: "1,250 REVO",
        tooltip: "Total rewards earned from all your staking activities",
        color: "bg-orange-100 text-orange-600",
        soon: true,
      },
      {
        icon: Trophy,
        label: "Stakers Supporting You",
        value: "89",
        tooltip: "Number of users who have staked in pools you created",
        color: "bg-indigo-100 text-indigo-600",
        soon: true,
      },
      {
        icon: Target,
        label: "Creator Pools Joined",
        value: "6",
        tooltip: "Number of different reward pools you are currently participating in",
        color: "bg-pink-100 text-pink-600",
        soon: true,
      },
    ],
    [balanceData?.formatted, balanceData?.symbol]
  );

  // Connected view (existing wallet interface)
  const loggedInView = (
    <div className="h-full overflow-y-auto">
      <div className="p-6 md:w-4/5 md:mx-auto">
        <div className="space-y-6">
          {/* Profile Section */}
          <ProfileSection
            address={address}
            walletStats={walletStats}
            onProfileOptionsClick={() => setShowProfileOptions(true)}
          />

          {/* Balance */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 space-y-2 sm:space-y-0">
              <h3 className="text-lg font-semibold text-gray-900">Wallet Balance</h3>
              <div className="flex items-center space-x-3">
                <span
                  className={`text-sm font-medium transition-colors duration-200 ${!isUSD ? "text-purple-600" : "text-gray-500"}`}
                >
                  REVO
                </span>
                <button
                  onClick={() => setIsUSD(!isUSD)}
                  className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 hover:bg-gray-300"
                  title={`Switch to ${isUSD ? "REVO" : "USD"}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${
                      isUSD ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span
                  className={`text-sm font-medium transition-colors duration-200 ${isUSD ? "text-green-600" : "text-gray-500"}`}
                >
                  USD
                </span>
              </div>
            </div>

            {/* Balance Display */}
            <div className="mb-4 sm:mb-6">
              <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                {currentIsBalanceLoading
                  ? "Loading..."
                  : isUSD
                    ? `$${(parseFloat(currentBalance ?? "0") * 2.5).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `${parseFloat(currentBalance ?? "0").toFixed(4)} ${currentSymbol ?? "REVO"}`}
              </div>

              {/* 7-day Change */}
              <div className="flex items-center space-x-1 text-xs sm:text-sm text-green-600">
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="font-medium">
                  {isUSD
                    ? `+$${(parseFloat(currentBalance ?? "0") * 0.05).toFixed(2)} (+1.5%)`
                    : `+${(parseFloat(currentBalance ?? "0") * 0.05).toFixed(4)} ${currentSymbol ?? "REVO"} (+1.5%)`}
                </span>
                <span className="text-gray-500">7d</span>
              </div>
            </div>

            {/* Earnings Chart */}
            {/* <div className="mb-4">
              <Suspense
                fallback={<div className="h-32 w-full bg-gray-100 rounded-lg animate-pulse"></div>}
              >
                <EarningsChart />
              </Suspense>
            </div> */}

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
                onClick={() => setShowSendModal(true)}
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

            <Suspense fallback={null}>
              <FundWalletDialog open={showFundModal} onOpenChange={setShowFundModal} />
            </Suspense>
          </div>

          <Suspense fallback={<div className="text-center text-gray-500">Loading...</div>}>
            <BalanceCard />
          </Suspense>

          <Suspense
            fallback={<div className="text-center text-gray-500">Loading Staked Pools...</div>}
          >
            <StakedPoolsSection />
          </Suspense>

          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Trophy className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Reward Pools</h3>
                  <div className="text-sm text-gray-600 mt-1 space-y-1">
                    <p>Create and manage staking-based reward pools for your community.</p>
                    <p>Distribute tokens, NFTs, or access based on onchain participation.</p>
                  </div>
                </div>
              </div>

              <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                <Info className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between">
              <div className="flex items-center space-x-4 mb-3 sm:mb-0">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span>Boost community engagement</span>
                </div>
              </div>

              <div className="w-full sm:w-auto flex justify-center">
                <button
                  disabled
                  className="relative px-4 py-2 bg-purple-400 text-white rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2 opacity-60 cursor-not-allowed"
                >
                  <span className="absolute -top-2 -right-2 text-xs bg-yellow-200 text-yellow-800 rounded px-2 py-0.5 shadow-sm pointer-events-none select-none">
                    Soon
                  </span>
                  <Trophy className="w-4 h-4" />
                  <span>Launch Pool</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Options Modal */}
        <Suspense fallback={null}>
          <ProfileOptionsDialog
            open={showProfileOptions}
            onOpenChange={setShowProfileOptions}
            onActionClick={uiConsole}
          />
        </Suspense>

        {/* Send Modal */}
        <Suspense fallback={null}>
          <SendDialog
            open={showSendModal}
            onOpenChange={setShowSendModal}
            onSend={handleSendTransaction}
          />
        </Suspense>

        {/* Receive Modal */}
        <Suspense fallback={null}>
          <ReceiveDialog open={showReceiveModal} onOpenChange={setShowReceiveModal} />
        </Suspense>
      </div>
    </div>
  );

  return isConnected || isDemoMode ? loggedInView : unloggedInView;
}

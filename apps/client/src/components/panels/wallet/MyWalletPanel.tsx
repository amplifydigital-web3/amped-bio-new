import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useEditor } from "@/contexts/EditorContext";
import { AUTH_STORAGE_KEYS } from "@/constants/auth-storage";
import {
  Wallet,
  Copy,
  User,
  DollarSign,
  Gem,
  Coins,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  X,
  Check,
  Info,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/Button";
import { GridPattern } from "@/components/ui/grid-pattern";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { cn } from "@/lib/utils";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useWeb3Auth, useWeb3AuthConnect } from "@web3auth/modal/react";
import { Switch } from "@/components/ui/Switch";
import { useAccount, useBalance } from "wagmi";
import { useAuth } from "@/contexts/AuthContext";
import { trpcClient } from "@/utils/trpc";
import { AUTH_CONNECTION, WALLET_CONNECTORS } from "@web3auth/modal";

const StakedPoolsSection = lazy(() => import("./StakedPoolsSection"));
const BalanceCard = lazy(() => import("./BalanceCard"));
const FundWalletDialog = lazy(() => import("./dialogs/FundWalletDialog"));
const ProfileOptionsDialog = lazy(() => import("./dialogs/ProfileOptionsDialog"));
const ReceiveDialog = lazy(() => import("./dialogs/ReceiveDialog"));
const SendDialog = lazy(() => import("./dialogs/SendDialog"));

export function MyWalletPanel() {
  const {
    connectTo,
    isConnected,
    connectorName,
    loading: connectLoading,
    error: connectError,
  } = useWeb3AuthConnect();
  const dataWeb3Auth = useWeb3Auth();
  const { address } = useAccount();

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
  const { authUser } = useAuth();
  const { profile } = useEditor();
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showProfileOptions, setShowProfileOptions] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success">("idle");
  const [showFundModal, setShowFundModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isUSD, setIsUSD] = useState(false);

  const [selectedNetwork, setSelectedNetwork] = useState("Revochain Testnet");
  const availableNetworks = ["Revochain Testnet", "Revolution Mainnet"];

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

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopyStatus("success");
      setTimeout(() => {
        setCopyStatus("idle");
      }, 1000);
      uiConsole("Address copied to clipboard!");
    }
  };

  const formatAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

  const connectWallet = useCallback(async () => {
    try {
      const token = await trpcClient.auth.getWalletToken.query();

      await connectTo(WALLET_CONNECTORS.AUTH, {
        authConnection: AUTH_CONNECTION.CUSTOM,
        authConnectionId: import.meta.env.VITE_WEB3AUTH_AUTH_CONNECTION_ID,
        idToken: token.walletToken,
        extraLoginOptions: {
          isUserIdCaseSensitive: false,
        },
      });

      console.log("Wallet connected successfully");
    } catch (error) {
      console.error("Error fetching wallet token:", error);
    }
  }, [connectTo]);

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
                onClick={() => connectWallet()}
                disabled={
                  connectLoading ||
                  dataWeb3Auth?.isInitializing ||
                  !dataWeb3Auth?.isInitialized ||
                  !dataWeb3Auth?.web3Auth ||
                  !localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)
                }
              >
                {connectLoading || dataWeb3Auth?.status === "connecting"
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

  // Connected view (existing wallet interface)
  const loggedInView = (
    <div className="h-full overflow-y-auto">
      <div className="p-6 md:w-4/5 md:mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-3 rounded-full">
              <Wallet className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Wallet</h1>
              <p className="text-gray-600">Manage your digital wallet</p>
            </div>
          </div>

          {isDemoMode && (
            <div className="flex items-center space-x-2">
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                Demo Mode
              </Badge>
              <Button
                onClick={() => setIsDemoMode(false)}
                variant="outline"
                size="sm"
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Profile Section */}
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl">
            <CardContent className="p-6">
              <div className="flex flex-row items-center justify-between">
                {/* Avatar, name, address (left) */}
                <div className="flex items-center space-x-4">
                  <Avatar
                    className="h-16 w-16 cursor-pointer border border-gray-200 rounded-full"
                    onClick={() => setShowProfileOptions(true)}
                  >
                    <AvatarImage src={profile.photoUrl || profile.photoCmp || ""} alt="Profile" />
                    <AvatarFallback>
                      <User className="w-8 h-8 text-gray-300" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2
                      className="text-lg font-semibold text-gray-900 cursor-pointer"
                      onClick={() => setShowProfileOptions(true)}
                    >
                      @{authUser?.onelink || "User"}
                    </h2>
                    <div className="flex items-center space-x-1 mt-2">
                      <span className="font-mono text-sm text-gray-600" title={address || ""}>
                        <span className="inline-block rounded-full bg-blue-100 px-3 py-1 font-mono text-xs text-blue-800 border border-blue-200">
                          {formatAddress(address || "")}
                        </span>
                      </span>
                      <span
                        onClick={copyAddress}
                        className="h-8 w-8 flex items-center justify-center p-0 cursor-pointer text-blue-600 hover:text-blue-800"
                      >
                        {copyStatus === "idle" ? (
                          <Copy className="w-4 h-4" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Network Switch and Settings icon (right) */}
                <div className="flex items-center space-x-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <div className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer flex items-center space-x-2">
                        <span>{selectedNetwork}</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56">
                      <DropdownMenuLabel>Select Network</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {availableNetworks.map(network => (
                        <DropdownMenuItem
                          key={network}
                          onClick={() => setSelectedNetwork(network)}
                          className={network === selectedNetwork ? "bg-blue-50" : ""}
                          disabled={network === "Revolution Mainnet"}
                        >
                          {network}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span
                    className="ml-4 cursor-pointer text-gray-400 hover:text-gray-600"
                    onClick={() => setShowProfileOptions(true)}
                    aria-label="Profile Settings"
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") setShowProfileOptions(true);
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-7 h-7"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.01c1.527-.878 3.276.87 2.398 2.398a1.724 1.724 0 001.01 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.01 2.573c.878 1.527-.87 3.276-2.398 2.398a1.724 1.724 0 00-2.572 1.01c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.01c-1.527.878-3.276-.87-2.398-2.398a1.724 1.724 0 00-1.01-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.01-2.573c-.878-1.527.87-3.276 2.398-2.398.996.573 2.25.06 2.573-1.01z"
                      />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </span>
                </div>
              </div>
              {/* Stats Section below */}
              <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  {
                    id: "total-revo",
                    title: "Total REVO",
                    value: `${parseFloat(balanceData?.formatted ?? "0").toFixed(4)} ${balanceData?.symbol ?? "REVO"}`,
                    icon: <DollarSign className="w-5 h-5 text-blue-500" />,
                    iconColor: "text-blue-500",
                    hoverColor: "text-blue-600",
                    tooltip: "The total amount of REVO tokens you currently hold in your wallet.",
                    soon: false,
                  },
                  {
                    id: "my-stake",
                    title: "My Stake",
                    value: "8,750 REVO",
                    icon: <Coins className="w-5 h-5 text-indigo-500" />,
                    iconColor: "text-indigo-500",
                    hoverColor: "text-indigo-600",
                    tooltip: "The amount of REVO tokens you have staked in other creators' pools.",
                    soon: true,
                  },
                  {
                    id: "staked-to-me",
                    title: "Staked to Me",
                    value: "15,420 REVO",
                    icon: <TrendingUp className="w-5 h-5 text-green-500" />,
                    iconColor: "text-green-500",
                    hoverColor: "text-green-600",
                    tooltip: "The total REVO tokens other users have staked to support you.",
                    soon: true,
                  },
                  {
                    id: "earnings",
                    title: "Earnings to Date",
                    value: "1,250 REVO",
                    icon: <Gem className="w-5 h-5 text-purple-500" />,
                    iconColor: "text-purple-500",
                    hoverColor: "text-purple-600",
                    tooltip: "The total REVO tokens you have earned from staking and rewards.",
                    soon: true,
                  },
                  {
                    id: "stakers",
                    title: "Stakers Supporting You",
                    value: "89",
                    icon: <User className="w-5 h-5 text-yellow-500" />,
                    iconColor: "text-yellow-500",
                    hoverColor: "text-yellow-600",
                    tooltip: "The number of unique users currently staking REVO tokens to you.",
                    soon: true,
                  },
                  {
                    id: "pools",
                    title: "Creator Pools Joined",
                    value: "6",
                    icon: <Trophy className="w-5 h-5 text-pink-500" />,
                    iconColor: "text-pink-500",
                    hoverColor: "text-pink-600",
                    tooltip:
                      "The number of creator pools you have joined as a participant or supporter.",
                    soon: true,
                  },
                ].map(stat => (
                  <div
                    key={stat.id}
                    className={`${stat.soon ? "relative opacity-60" : "transition-transform transition-shadow duration-200 ease-in-out hover:scale-105 hover:shadow-lg cursor-pointer"} flex flex-col items-start bg-white/70 rounded-lg p-3 border border-blue-100`}
                  >
                    {stat.soon && (
                      <span className="absolute top-2 right-2 text-xs bg-yellow-200 text-yellow-800 rounded px-2 py-0.5 shadow-sm pointer-events-none select-none">
                        Soon
                      </span>
                    )}
                    <div className="flex items-center space-x-2">
                      {stat.icon}
                      <span className="text-xs text-gray-500 font-medium">{stat.title}</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={`ml-1 ${stat.iconColor.replace("500", "400")} hover:${stat.hoverColor}`}
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 text-xs">{stat.tooltip}</PopoverContent>
                      </Popover>
                    </div>
                    <span className="text-xl font-bold text-blue-900">{stat.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Balance */}
          <Card className="rounded-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="bg-green-100 p-2 rounded-full">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <CardTitle>Balance</CardTitle>
                </div>
                {/* Balance Conversion Switch as shadcn Switch */}
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-sm font-medium ${!isUSD ? "text-blue-700" : "text-gray-500"}`}
                  >
                    REVO
                  </span>
                  <Switch
                    checked={isUSD}
                    onChange={setIsUSD}
                    aria-label="Toggle balance currency"
                    className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-200"
                  />
                  <span
                    className={`text-sm font-medium ${isUSD ? "text-blue-700" : "text-gray-500"}`}
                  >
                    USD
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 mb-2">
                {currentIsBalanceLoading
                  ? "Loading..."
                  : isUSD
                    ? `$${(parseFloat(currentBalance ?? "0") * 2.5).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                    : `${parseFloat(currentBalance ?? "0").toFixed(4)} ${currentSymbol ?? "REVO"}`}
              </div>
              <CardDescription className="mb-6">Your current wallet balance</CardDescription>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-4">
                <Dialog open={showFundModal} onOpenChange={setShowFundModal}>
                  <DialogTrigger asChild>
                    <Button
                      className="h-20 flex flex-col items-center justify-center space-y-2 bg-green-50 hover:bg-green-100 text-green-700 border-green-200 hover:border-green-300 transition-all duration-200 ease-in-out transform hover:scale-105"
                      variant="outline"
                    >
                      <Plus className="w-8 h-8 p-2 bg-gray-50 rounded-lg" />
                      <span className="text-sm font-medium">Fund</span>
                    </Button>
                  </DialogTrigger>
                </Dialog>
                <Suspense fallback={null}>
                  <FundWalletDialog open={showFundModal} onOpenChange={setShowFundModal} />
                </Suspense>
                <Button
                  onClick={() => setShowSendModal(true)}
                  className="h-20 flex flex-col items-center justify-center space-y-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 hover:border-blue-300 transition-all duration-200 ease-in-out transform hover:scale-105"
                  variant="outline"
                >
                  <ArrowUpRight className="w-8 h-8 p-2 bg-gray-50 rounded-lg" />
                  <span className="text-sm font-medium">Send</span>
                </Button>
                <Button
                  onClick={() => setShowReceiveModal(true)}
                  className="h-20 flex flex-col items-center justify-center space-y-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 hover:border-purple-300 transition-all duration-200 ease-in-out transform hover:scale-105"
                  variant="outline"
                >
                  <ArrowDownLeft className="w-8 h-8 p-2 bg-gray-50 rounded-lg" />
                  <span className="text-sm font-medium">Receive</span>
                </Button>
              </div>
            </CardContent>
          </Card>

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

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span>Boost community engagement</span>
                </div>
              </div>

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

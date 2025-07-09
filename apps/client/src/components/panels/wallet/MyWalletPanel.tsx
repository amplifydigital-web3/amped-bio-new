import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useEditorStore } from "@/store/editorStore";
import {
  Wallet,
  Copy,
  User,
  DollarSign,
  Gem,
  Coins,
  QrCode,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  X,
  History,
  Clock,
  Check,
  ArrowRight,
  CreditCard,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GridPattern } from "@/components/ui/grid-pattern";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover1";
import { useAccount, useBalance } from "wagmi";
import { WALLET_CONNECTORS, AUTH_CONNECTION } from "@web3auth/modal";
import {
  useWeb3Auth,
  useWeb3AuthConnect,
  useWeb3AuthDisconnect,
  useWeb3AuthUser,
} from "@web3auth/modal/react";

export function MyWalletPanel() {
  const {
    connectTo,
    isConnected,
    connectorName,
    loading: connectLoading,
    error: connectError,
  } = useWeb3AuthConnect();
  const {
    disconnect,
    loading: disconnectLoading,
    error: disconnectError,
  } = useWeb3AuthDisconnect();
  const dataWeb3Auth = useWeb3Auth();

  const { userInfo } = useWeb3AuthUser();
  const { address } = useAccount();

  useEffect(() => {
    uiConsole("Web3Auth User Info:", userInfo);
    uiConsole("Wagmi Address:", address);
  }, [userInfo, address]);

  useEffect(() => {
    uiConsole("Web3Auth Status:", {
      isConnected: dataWeb3Auth?.isConnected,
      isInitialized: dataWeb3Auth?.isInitialized,
      isInitializing: dataWeb3Auth?.isInitializing,
      status: dataWeb3Auth?.status,
      initError: dataWeb3Auth?.initError,
    });
  }, [
    dataWeb3Auth?.isConnected,
    dataWeb3Auth?.isInitialized,
    dataWeb3Auth?.isInitializing,
    dataWeb3Auth?.status,
    dataWeb3Auth?.initError,
  ]);

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
  const profile = useEditorStore(state => state.profile);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showProfileOptions, setShowProfileOptions] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success">("idle");
  const [showFundModal, setShowFundModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendLoading, setSendLoading] = useState(false);

  const { address: walletAddress } = useAccount();

  const { data: balanceData, isLoading: isBalanceLoading } = useBalance({
    address: walletAddress,
  });

  // Sample data for tokens (empty for now)
  const sampleTokens: any[] = [];

  // Sample data for NFTs (empty for now)
  const sampleNFTs: any[] = [];

  // Sample transaction history data (empty for now)
  const sampleTransactions: any[] = [];

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
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

  const generateQRCode = (address: string) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(address)}`;
  };

  const formatTransactionHash = (hash: string) => {
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  const formatTransactionAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatTransactionTime = (timestamp: Date) => {
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    }
  };

  function uiConsole(...args: any[]): void {
    console.log(...args);
  }

  const handleSendTransaction = async () => {
    if (!sendAddress || !sendAmount) {
      uiConsole("Address and amount are required");
      return;
    }

    setSendLoading(true);
    try {
      // TODO: Implement actual transaction sending logic here
      uiConsole("Sending transaction:", { to: sendAddress, amount: sendAmount });

      // Simulate transaction delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Reset form and close modal on success
      setSendAddress("");
      setSendAmount("");
      setShowSendModal(false);

      uiConsole("Transaction sent successfully!");
    } catch (error) {
      uiConsole("Failed to send transaction:", error);
    } finally {
      setSendLoading(false);
    }
  };

  const calculateRemainingBalance = () => {
    if (!balanceData?.formatted || !sendAmount) return balanceData?.formatted || "0";

    const currentBalance = parseFloat(balanceData.formatted);
    const amountToSend = parseFloat(sendAmount);

    if (isNaN(amountToSend)) return balanceData.formatted;

    const remaining = currentBalance - amountToSend;
    return remaining >= 0 ? remaining.toFixed(4) : "0";
  };

  const isValidSendAmount = () => {
    if (!balanceData?.formatted || !sendAmount) return false;

    const currentBalance = parseFloat(balanceData.formatted);
    const amountToSend = parseFloat(sendAmount);

    return !isNaN(amountToSend) && amountToSend > 0 && amountToSend <= currentBalance;
  };

  const handleConnectWallet = useCallback(async () => {
    try {
      // Enhanced initialization checks
      if (!dataWeb3Auth?.isInitialized) {
        uiConsole("Web3Auth is not initialized yet. Please wait...");
        return;
      }

      if (dataWeb3Auth?.isInitializing) {
        uiConsole("Web3Auth is still initializing. Please wait...");
        return;
      }

      // Additional check for Web3Auth instance
      if (!dataWeb3Auth?.web3Auth) {
        uiConsole("Web3Auth instance is not available yet. Please wait...");
        return;
      }

      // Wait a bit more to ensure everything is ready
      uiConsole("Web3Auth appears ready, attempting connection...");

      // Add a small delay to ensure Web3Auth is fully ready
      await new Promise(resolve => setTimeout(resolve, 500));

      const idToken = localStorage.getItem("amped-bio-auth-token");
      if (!idToken) {
        uiConsole("No auth token found. Please log in first.");
        return;
      }

      uiConsole("Connecting with token:", idToken.substring(0, 20) + "...");

      await connectTo(WALLET_CONNECTORS.AUTH, {
        authConnection: AUTH_CONNECTION.CUSTOM,
        authConnectionId: import.meta.env.VITE_WEB3AUTH_AUTH_CONNECTION_ID,
        idToken: idToken,
        extraLoginOptions: {
          isUserIdCaseSensitive: false,
        },
      });

      uiConsole("Connection attempt completed successfully");
    } catch (error) {
      uiConsole("Wallet connection error:", error);

      // Additional error details
      if (error instanceof Error) {
        uiConsole("Error details:", {
          message: error.message,
          stack: error.stack,
          name: error.name,
        });
      }
    }
  }, [
    dataWeb3Auth?.isInitialized,
    dataWeb3Auth?.isInitializing,
    dataWeb3Auth?.web3Auth,
    connectTo,
  ]);

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
            <ShimmerButton
              onClick={handleConnectWallet}
              // disabled={
              //   connectLoading ||
              //   !dataWeb3Auth?.isInitialized ||
              //   dataWeb3Auth?.isInitializing ||
              //   !dataWeb3Auth?.web3Auth ||
              //   !localStorage.getItem("amped-bio-auth-token")
              // }
              className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 px-8 py-3 text-lg"
              shimmerColor="#60a5fa"
            >
              {connectLoading
                ? "Connecting..."
                : dataWeb3Auth?.isInitializing
                  ? "Initializing..."
                  : !dataWeb3Auth?.isInitialized
                    ? "Waiting for initialization..."
                    : !dataWeb3Auth?.web3Auth
                      ? "Loading Web3Auth..."
                      : !localStorage.getItem("amped-bio-auth-token")
                        ? "No auth token found"
                        : "Connect Wallet"}
            </ShimmerButton>
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
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center space-x-3 mb-8">
          <div className="bg-blue-100 p-3 rounded-full">
            <Wallet className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Wallet</h1>
            <p className="text-gray-600">Manage your digital wallet</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Profile Section */}
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
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
                    <div className="flex items-center space-x-1 mt-1">
                      <span className="font-mono text-sm text-gray-600" title={walletAddress || ""}>
                        {formatAddress(walletAddress || "")}
                      </span>
                      <Button
                        onClick={copyAddress}
                        className="h-7 w-7 text-white hover:text-gray-200 bg-gray-600 hover:bg-gray-700"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">
                    {isBalanceLoading
                      ? "Loading..."
                      : `${parseFloat(balanceData?.formatted ?? "0").toFixed(4)} ${balanceData?.symbol ?? "ETH"}`}
                  </div>
                  <p className="text-sm text-gray-600">Total Balance</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Balance */}
          <Card className="rounded-2xl">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <CardTitle>Balance</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 mb-2">
                {isBalanceLoading
                  ? "Loading..."
                  : `${parseFloat(balanceData?.formatted ?? "0").toFixed(4)} ${balanceData?.symbol ?? "ETH"}`}
              </div>
              <CardDescription className="mb-6">Your current wallet balance</CardDescription>

              {/* Action Buttons */}
              <div className="grid grid-cols-5 gap-4">
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
                  <DialogContent className="max-w-sm rounded-2xl">
                    <DialogHeader>
                      <DialogTitle>Fund Wallet</DialogTitle>
                      <DialogDescription>Choose a method to fund your wallet.</DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-4">
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col items-start space-y-1"
                        onClick={() =>
                          window.open(
                            "https://bridge.dev.revolutionchain.io/bridge?address=" +
                              (walletAddress || ""),
                            "_blank",
                            "width=600,height=700,left=200,top=200"
                          )
                        }
                      >
                        <DollarSign className="w-6 h-6" />
                        <span className="font-medium">Bridge</span>
                        <p className="text-xs text-gray-500">Transfer crypto from other networks</p>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col items-start space-y-1"
                      >
                        <CreditCard className="w-6 h-6" />
                        <span className="font-medium">Onramp</span>
                        <p className="text-xs text-gray-500">Buy crypto with fiat currency</p>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col items-start space-y-1"
                      >
                        <DollarSign className="w-6 h-6" />
                        <span className="font-medium">MoonPay</span>
                        <p className="text-xs text-gray-500">
                          Buy crypto with various payment methods
                        </p>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex flex-col items-start space-y-1"
                      >
                        <Coins className="w-6 h-6" />
                        <span className="font-medium">Coinbase</span>
                        <p className="text-xs text-gray-500">Connect your Coinbase account</p>
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
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

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      disabled
                      className="h-20 flex flex-col items-center justify-center space-y-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border-yellow-200 hover:border-yellow-300 transition-all duration-200 ease-in-out transform hover:scale-105 opacity-60 cursor-not-allowed"
                      variant="outline"
                    >
                      <Coins className="w-8 h-8 p-2 bg-gray-50 rounded-lg" />
                      <span className="text-sm font-medium">Stake</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <p className="text-sm text-gray-600">Soon</p>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      disabled
                      className="h-20 flex flex-col items-center justify-center space-y-2 bg-red-50 hover:bg-red-100 text-red-700 border-red-200 hover:border-red-300 transition-all duration-200 ease-in-out transform hover:scale-105 opacity-60 cursor-not-allowed"
                      variant="outline"
                    >
                      <Gem className="w-8 h-8 p-2 bg-gray-50 rounded-lg" />
                      <span className="text-sm font-medium">Unstake</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <p className="text-sm text-gray-600">Soon</p>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          {/* Tokens, NFTs & History Section */}
          <Card className="rounded-2xl">
            <Tabs defaultValue="tokens" className="w-full">
              <TabsList className="flex justify-start w-fit">
                <TabsTrigger
                  value="tokens"
                  className="flex items-center space-x-2 transition-all duration-200 ease-in-out"
                >
                  <Coins className="w-4 h-4" />
                  <span>Tokens</span>
                </TabsTrigger>
                <TabsTrigger
                  value="nfts"
                  className="flex items-center space-x-2 transition-all duration-200 ease-in-out"
                >
                  <Gem className="w-4 h-4" />
                  <span>NFTs</span>
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="flex items-center space-x-2 transition-all duration-200 ease-in-out"
                >
                  <History className="w-4 h-4" />
                  <span>History</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tokens">
                {sampleTokens.length > 0 ? (
                  <div className="space-y-3">
                    {sampleTokens.map(token => (
                      <div
                        key={token.id}
                        className="flex justify-between items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="text-2xl w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-sm">
                            {token.icon}
                          </div>
                          <div>
                            <h4 className="text-gray-900 font-semibold">{token.name}</h4>
                            <p className="text-gray-500 text-sm">{token.symbol}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-900 font-semibold">
                            {token.balance} {token.symbol}
                          </p>
                          <p className="text-gray-500 text-sm">{token.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center justify-center py-12 text-center overflow-hidden rounded-lg bg-gray-50">
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
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <Coins className="w-8 h-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No Tokens here</h3>
                      <p className="text-gray-500 text-sm mb-6 max-w-xs">
                        Fund account or receive assets to see them here.
                      </p>
                      <ShimmerButton
                        onClick={() => uiConsole("Fund account")}
                        className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                        shimmerColor="#60a5fa"
                      >
                        Fund Account
                      </ShimmerButton>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="nfts">
                {sampleNFTs.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {sampleNFTs.map(nft => (
                      <Card
                        key={nft.id}
                        className="overflow-hidden hover:shadow-md transition-shadow"
                      >
                        <div className="aspect-square">
                          <img
                            src={nft.image}
                            alt={nft.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <CardContent className="p-3">
                          <h4 className="text-gray-900 font-semibold text-sm truncate">
                            {nft.name}
                          </h4>
                          <p className="text-gray-500 text-xs">{nft.collection}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center justify-center py-12 text-center overflow-hidden rounded-lg bg-purple-50">
                    <GridPattern
                      squares={[
                        [3, 3],
                        [6, 1],
                        [9, 3],
                        [4, 5],
                        [11, 7],
                        [13, 2],
                        [1, 9],
                        [16, 4],
                      ]}
                      className={cn(
                        "absolute inset-0 h-full w-full fill-purple-400/20 stroke-purple-400/20 text-purple-400/30",
                        "[mask-image:radial-gradient(300px_circle_at_center,white,transparent)]"
                      )}
                      width={25}
                      height={25}
                    />
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                        <Gem className="w-8 h-8 text-purple-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No NFTs here</h3>
                      <p className="text-gray-500 text-sm mb-6 max-w-xs">
                        Fund account or receive assets to see them here.
                      </p>
                      <ShimmerButton
                        onClick={() => uiConsole("Fund account")}
                        className="bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
                        shimmerColor="#a855f7"
                      >
                        Fund Account
                      </ShimmerButton>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history">
                {sampleTransactions.length > 0 ? (
                  <div className="space-y-3">
                    {sampleTransactions.map(transaction => (
                      <div
                        key={transaction.id}
                        className="flex justify-between items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-10 h-10 flex items-center justify-center rounded-full ${
                              transaction.type === "received"
                                ? "bg-green-100 text-green-600"
                                : "bg-blue-100 text-blue-600"
                            }`}
                          >
                            {transaction.type === "received" ? (
                              <ArrowDownLeft className="w-5 h-5" />
                            ) : (
                              <ArrowUpRight className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="text-gray-900 font-semibold capitalize">
                                {transaction.type}
                              </h4>
                              <Badge
                                variant={
                                  transaction.status === "completed" ? "default" : "secondary"
                                }
                                className={
                                  transaction.status === "completed"
                                    ? "bg-green-100 text-green-800 hover:bg-green-100"
                                    : "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
                                }
                              >
                                {transaction.status}
                              </Badge>
                            </div>
                            <div className="flex items-center space-x-2 text-sm text-gray-500">
                              <span>
                                {transaction.type === "received" ? "From" : "To"}:{" "}
                                {formatTransactionAddress(
                                  transaction.type === "received"
                                    ? transaction.from
                                    : transaction.to
                                )}
                              </span>
                              <span>•</span>
                              <span>{formatTransactionTime(transaction.timestamp)}</span>
                            </div>
                            <p className="text-xs text-gray-400 font-mono">
                              {formatTransactionHash(transaction.hash)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-semibold ${
                              transaction.type === "received" ? "text-green-600" : "text-gray-900"
                            }`}
                          >
                            {transaction.type === "received" ? "+" : "-"}
                            {transaction.amount}
                          </p>
                          <p className="text-gray-500 text-sm">{transaction.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center justify-center py-12 text-center overflow-hidden rounded-lg bg-green-50">
                    <GridPattern
                      squares={[
                        [2, 4],
                        [7, 2],
                        [10, 5],
                        [3, 7],
                        [12, 8],
                        [14, 1],
                        [0, 10],
                        [17, 6],
                      ]}
                      className={cn(
                        "absolute inset-0 h-full w-full fill-green-400/20 stroke-green-400/20 text-green-400/30",
                        "[mask-image:radial-gradient(300px_circle_at_center,white,transparent)]"
                      )}
                      width={30}
                      height={30}
                    />
                    <div className="relative z-10 flex flex-col items-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <History className="w-8 h-8 text-green-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        No Transactions here
                      </h3>
                      <p className="text-gray-500 text-sm mb-6 max-w-xs">
                        Fund account or receive assets to see them here.
                      </p>
                      <ShimmerButton
                        onClick={() => uiConsole("Fund account")}
                        className="bg-green-600 hover:bg-green-700 text-white border-green-600"
                        shimmerColor="#22c55e"
                      >
                        Fund Account
                      </ShimmerButton>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </Card>

          {/* Security Notice */}
          <Card className="bg-amber-50 border-amber-200 rounded-2xl">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-amber-800 mb-2">Security Notice</h3>
              <p className="text-amber-700 text-sm">
                Your wallet is securely encrypted and stored. Never share your private keys or
                recovery phrase with anyone.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Profile Options Modal */}
        {showProfileOptions && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="max-w-sm w-full mx-4 rounded-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] duration-300">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Profile Options</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowProfileOptions(false)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >
                    <X className="w-6 h-6" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    uiConsole("Edit Profile");
                    setShowProfileOptions(false);
                  }}
                >
                  <User className="w-4 h-4 mr-2" />
                  Edit Profile
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    uiConsole("Account Settings");
                    setShowProfileOptions(false);
                  }}
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Account Settings
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    uiConsole("Wallet Settings");
                    setShowProfileOptions(false);
                  }}
                >
                  <Wallet className="w-4 h-4 mr-2" />
                  Wallet Settings
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => {
                    uiConsole("Logout");
                    setShowProfileOptions(false);
                  }}
                >
                  <ArrowUpRight className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Send Modal */}
        {showSendModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="max-w-md w-full mx-4 rounded-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] duration-300">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Send ETH</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowSendModal(false);
                      setSendAddress("");
                      setSendAmount("");
                    }}
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >
                    <X className="w-6 h-6" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Current Balance */}
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-blue-700">Current Balance</span>
                    <span className="text-lg font-bold text-blue-900">
                      {isBalanceLoading
                        ? "Loading..."
                        : `${parseFloat(balanceData?.formatted ?? "0").toFixed(4)} ${balanceData?.symbol ?? "ETH"}`}
                    </span>
                  </div>
                  {sendAmount && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-blue-700">After Transaction</span>
                      <span className="text-lg font-bold text-blue-900">
                        {calculateRemainingBalance()} {balanceData?.symbol ?? "ETH"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Recipient Address */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Recipient Address</label>
                  <Input
                    type="text"
                    placeholder="0x..."
                    value={sendAddress}
                    onChange={e => setSendAddress(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Amount ({balanceData?.symbol ?? "ETH"})
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="0.0"
                      value={sendAmount}
                      onChange={e => setSendAmount(e.target.value)}
                      step="0.0001"
                      min="0"
                      max={balanceData?.formatted ?? "0"}
                    />
                    <Button
                      onClick={() => setSendAmount(balanceData?.formatted ?? "0")}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs px-2 py-1 h-6 bg-blue-100 hover:bg-blue-200 text-blue-700"
                      variant="outline"
                      size="sm"
                    >
                      Max
                    </Button>
                  </div>
                  {sendAmount && !isValidSendAmount() && (
                    <p className="text-red-500 text-xs">
                      {parseFloat(sendAmount) > parseFloat(balanceData?.formatted ?? "0")
                        ? "Insufficient balance"
                        : "Please enter a valid amount"}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3 pt-4">
                  <Button
                    onClick={() => {
                      setShowSendModal(false);
                      setSendAddress("");
                      setSendAmount("");
                    }}
                    variant="outline"
                    className="flex-1"
                    disabled={sendLoading}
                  >
                    Cancel
                  </Button>
                  <ShimmerButton
                    onClick={handleSendTransaction}
                    disabled={sendLoading || !isValidSendAmount() || !sendAddress}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                    shimmerColor="#60a5fa"
                  >
                    {sendLoading ? "Sending..." : "Send ETH"}
                  </ShimmerButton>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Receive Modal */}
        {showReceiveModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="max-w-md w-full mx-4 rounded-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] duration-300">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Receive Crypto</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowReceiveModal(false)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >
                    <X className="w-6 h-6" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="text-center">
                {/* QR Code */}
                <div className="bg-white p-4 rounded-lg border-2 border-gray-200 inline-block mb-6">
                  <img
                    src={generateQRCode(walletAddress || "")}
                    alt="QR Code"
                    className="w-48 h-48"
                  />
                </div>

                {/* Wallet Address */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-600 mb-2">Wallet Address</h4>
                  <div className="bg-gray-50 rounded-lg p-4 border flex items-center justify-between">
                    <p className="font-mono text-sm text-gray-900 break-all">
                      {walletAddress || ""}
                    </p>
                    <Button
                      onClick={copyAddress}
                      className="ml-2 flex-shrink-0 relative w-8 h-8 p-2 bg-gray-600 hover:bg-gray-700 rounded-lg"
                    >
                      <Copy
                        className={`w-4 h-4 text-white transition-opacity duration-300 ${copyStatus === "idle" ? "opacity-100" : "opacity-0"}`}
                      />
                      <Check
                        className={`w-4 h-4 text-green-500 transition-opacity duration-300 absolute ${copyStatus === "success" ? "opacity-100" : "opacity-0"}`}
                      />
                    </Button>
                  </div>
                </div>

                {/* Warning */}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );

  return isConnected ? loggedInView : unloggedInView;
}

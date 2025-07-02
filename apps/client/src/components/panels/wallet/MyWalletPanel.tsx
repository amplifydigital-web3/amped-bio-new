import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
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
import { trpc, trpcClient } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";

export function MyWalletPanel() {
  const { authUser } = useAuthStore();
  const profile = useEditorStore(state => state.profile);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showProfileOptions, setShowProfileOptions] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success">("idle");
  const [showFundModal, setShowFundModal] = useState(false);

  const { data: walletBalanceData, isLoading: isBalanceLoading } = useQuery(
    trpc.wallet.getETHBalance.queryOptions(),
  );

  

  const walletAddress = authUser!.walletAddress;

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
      console.log("Address copied to clipboard!");
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

  return (
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
                      <span className="font-mono text-sm text-gray-600" title={walletAddress}>
                        {formatAddress(walletAddress)}
                      </span>
                      <Button
                        onClick={copyAddress}
                        className="h-7 w-7 text-gray-500 hover:text-gray-800"
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
                      : `${parseFloat(walletBalanceData?.balance ?? "0").toFixed(4)} ETH`}
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
                  : `${parseFloat(walletBalanceData?.balance ?? "0").toFixed(4)} ETH`}
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
                            "https://bridge.dev.revolutionchain.io/bridge?address=" + walletAddress,
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
                  onClick={() => console.log("Send crypto")}
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

                <Button
                  onClick={() => console.log("Stake crypto")}
                  className="h-20 flex flex-col items-center justify-center space-y-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border-yellow-200 hover:border-yellow-300 transition-all duration-200 ease-in-out transform hover:scale-105"
                  variant="outline"
                >
                  <Coins className="w-8 h-8 p-2 bg-gray-50 rounded-lg" />
                  <span className="text-sm font-medium">Stake</span>
                </Button>

                <Button
                  onClick={() => console.log("Unstake crypto")}
                  className="h-20 flex flex-col items-center justify-center space-y-2 bg-red-50 hover:bg-red-100 text-red-700 border-red-200 hover:border-red-300 transition-all duration-200 ease-in-out transform hover:scale-105"
                  variant="outline"
                >
                  <Gem className="w-8 h-8 p-2 bg-gray-50 rounded-lg" />
                  <span className="text-sm font-medium">Unstake</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Wallet Info */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Wallet Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Created</span>
                  <span className="text-gray-900 font-medium">
                    {/* {new Date(placeholderWallet.created_at).toLocaleDateString()} */}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Wallet ID</span>
                  {/* <span className="text-gray-900 font-medium">#{placeholderWallet.id}</span> */}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Network</span>
                  <span className="text-gray-900 font-medium">Ethereum</span>
                </div>
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
                        onClick={() => console.log("Fund account")}
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
                        onClick={() => console.log("Fund account")}
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
                        onClick={() => console.log("Fund account")}
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
                    console.log("Edit Profile");
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
                    console.log("Account Settings");
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
                    console.log("Wallet Settings");
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
                    console.log("Logout");
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
                  <img src={generateQRCode(walletAddress)} alt="QR Code" className="w-48 h-48" />
                </div>

                {/* Wallet Address */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-600 mb-2">Wallet Address</h4>
                  <div className="bg-gray-50 rounded-lg p-4 border flex items-center justify-between">
                    <p className="font-mono text-sm text-gray-900 break-all">{walletAddress}</p>
                    <Button
                      onClick={copyAddress}
                      className="ml-2 flex-shrink-0 relative w-8 h-8 p-2 bg-gray-50 rounded-lg"
                    >
                      <Copy
                        className={`w-4 h-4 transition-opacity duration-300 ${copyStatus === "idle" ? "opacity-100" : "opacity-0"}`}
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
}

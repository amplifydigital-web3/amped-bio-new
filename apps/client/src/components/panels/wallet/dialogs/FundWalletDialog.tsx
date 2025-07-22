import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CreditCard, Coins, DollarSign, CheckCircle, ExternalLink } from "lucide-react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import GiftLottie from "@/assets/lottie/gift.lottie";
import CoinbaseIcon from "@/assets/icons/coinbase.png";
import OnRampIcon from "@/assets/icons/onramp.png";
import MoonPayIcon from "@/assets/icons/moonpay.png";
import { useAccount } from "wagmi";
import { useState } from "react";

interface FundWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handleClaimDailyFaucet: () => Promise<{ success: boolean; txid?: string }>;
  claimingFaucet: boolean;
}

export function FundWalletDialog({
  open,
  onOpenChange,
  handleClaimDailyFaucet,
  claimingFaucet,
}: FundWalletDialogProps) {
  // Get wallet address directly using wagmi hook
  const { address: walletAddress } = useAccount();

  // State for success dialog
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [txInfo, setTxInfo] = useState<{ txid: string }>();

  // Handle claim with success dialog
  const handleClaim = async () => {
    try {
      const result = await handleClaimDailyFaucet();
      if (result.success && result.txid) {
        setTxInfo({ txid: result.txid });
        setShowSuccessDialog(true);
      }
    } catch (error) {
      console.error("Error claiming faucet:", error);
    }
  };

  return (
    <>
      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Transaction Sent
            </DialogTitle>
            <DialogDescription>
              Your daily faucet tokens claim has been submitted to the network and is awaiting
              confirmation.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Transaction ID (Pending):</p>
              <p className="text-sm font-mono break-all">{txInfo?.txid}</p>
              <p className="text-xs text-amber-600 mt-2">
                Note: The transaction is being processed and may take a few minutes to be confirmed.
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setShowSuccessDialog(false)}>
              Close
            </Button>
            <Button
              onClick={() =>
                window.open(`https://explorer.dev.revolutionchain.io/tx/${txInfo?.txid}`, "_blank")
              }
              className="gap-2"
            >
              View in Explorer (may be pending) <ExternalLink className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Fund Wallet</DialogTitle>
            <DialogDescription>Choose a method to fund your wallet.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-start space-y-1 bg-green-50 hover:bg-green-100 text-green-700 border-green-200 hover:border-green-300 transition-all duration-200 ease-in-out"
              onClick={handleClaim}
              disabled={claimingFaucet}
            >
              <div className="w-6 h-6 flex items-center justify-start overflow-visible">
                <DotLottieReact
                  src={GiftLottie}
                  loop
                  autoplay
                  style={{
                    width: "32px",
                    height: "32px",
                    marginLeft: "-3px",
                    marginTop: "-3px",
                  }}
                />
              </div>
              <span className="font-medium">Claim Daily Faucet</span>
              <p className="text-xs text-gray-500">Get your free tokens every day</p>
              {claimingFaucet && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-lg">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-700"></div>
                </div>
              )}
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-start space-y-1"
              onClick={() =>
                window.open(
                  "https://bridge.dev.revolutionchain.io/bridge?address=" + (walletAddress || ""),
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
              className="h-auto py-4 flex flex-col items-start space-y-1 opacity-60 cursor-not-allowed"
              disabled
            >
              <img src={OnRampIcon} alt="Onramp" className="w-6 h-6" />
              <span className="font-medium flex items-center">
                Onramp{" "}
                <span className="ml-2 text-xs bg-gray-200 text-gray-600 rounded px-2 py-0.5">
                  Soon
                </span>
              </span>
              <p className="text-xs text-gray-500">Buy crypto with fiat currency</p>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-start space-y-1 opacity-60 cursor-not-allowed"
              disabled
            >
              <img src={MoonPayIcon} alt="MoonPay" className="w-6 h-6" />
              <span className="font-medium flex items-center">
                MoonPay{" "}
                <span className="ml-2 text-xs bg-gray-200 text-gray-600 rounded px-2 py-0.5">
                  Soon
                </span>
              </span>
              <p className="text-xs text-gray-500">Buy crypto with various payment methods</p>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-start space-y-1 opacity-60 cursor-not-allowed"
              disabled
            >
              <img src={CoinbaseIcon} alt="Coinbase" className="w-6 h-6" />
              <span className="font-medium flex items-center">
                Coinbase{" "}
                <span className="ml-2 text-xs bg-gray-200 text-gray-600 rounded px-2 py-0.5">
                  Soon
                </span>
              </span>
              <p className="text-xs text-gray-500">Connect your Coinbase account</p>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

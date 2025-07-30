import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DollarSign, CheckCircle, ExternalLink, Clock } from "lucide-react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import GiftLottie from "@/assets/lottie/gift.lottie";
import CoinbaseIcon from "@/assets/icons/coinbase.png";
import OnRampIcon from "@/assets/icons/onramp.png";
import MoonPayIcon from "@/assets/icons/moonpay.png";
import { useState, useEffect, useRef } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { useFundWalletDialog } from "../hooks/useFundWalletDialog";

// Component to display countdown timer
function CountdownTimer({ targetDate, onComplete }: { targetDate: Date; onComplete?: () => void }) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
  }>({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    // Function to calculate time left
    const calculateTimeLeft = () => {
      const difference = targetDate.getTime() - new Date().getTime();

      if (difference <= 0) {
        // Time's up
        return { hours: 0, minutes: 0, seconds: 0 };
      }

      // Calculate hours, minutes, seconds
      const hours = Math.floor(difference / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      return { hours, minutes, seconds };
    };

    // Set initial time
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const timer = setInterval(() => {
      const timeRemaining = calculateTimeLeft();
      setTimeLeft(timeRemaining);

      // When countdown reaches zero, trigger onComplete callback
      if (timeRemaining.hours === 0 && timeRemaining.minutes === 0 && timeRemaining.seconds === 0) {
        clearInterval(timer);
        if (onComplete) {
          onComplete();
        }
      }
    }, 1000);

    // Clean up
    return () => clearInterval(timer);
  }, [targetDate, onComplete]);

  // Format with leading zeros
  const formatTime = (num: number) => num.toString().padStart(2, "0");

  return (
    <span className="font-mono">
      {formatTime(timeLeft.hours)}:{formatTime(timeLeft.minutes)}:{formatTime(timeLeft.seconds)}
    </span>
  );
}

// Hook to control the wallet funding dialog

interface FundWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function FundWalletDialog({ open, onOpenChange }: FundWalletDialogProps) {
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  const {
    showSuccessDialog,
    setShowSuccessDialog,
    txInfo,
    faucetAmount,
    isLoadingFaucetAmount,
    claimingFaucet,
    faucetInfo,
    setFaucetInfo,
    handleClaim,
    walletAddress,
  } = useFundWalletDialog({
    open,
    onOpenChange,
    recaptchaToken,
  });

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
              onClick={() => window.open(`https://dev.revoscan.io/tx/${txInfo?.txid}`, "_blank")}
              className="gap-2"
            >
              View in Explorer <ExternalLink className="w-4 h-4" />
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
              className={`h-auto py-4 flex flex-col items-start space-y-1 relative
                ${
                  faucetInfo.canRequestNow
                    ? "bg-green-50 hover:bg-green-100 text-green-700 border-green-200 hover:border-green-300"
                    : "bg-gray-50 text-gray-500 border-gray-200"
                } 
                transition-all duration-200 ease-in-out`}
              onClick={handleClaim}
              disabled={claimingFaucet || !faucetInfo.canRequestNow || !recaptchaToken}
            >
              <div className="w-6 h-6 flex items-center justify-start overflow-visible">
                {faucetInfo.canRequestNow ? (
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
                ) : (
                  <div className="w-6 h-6 flex items-center justify-center">
                    <Clock className="w-5 h-5" />
                  </div>
                )}
              </div>
              <span className="font-medium">
                {faucetInfo.canRequestNow ? "Claim Daily Faucet" : "Faucet on Cooldown"}
              </span>
              <p className="text-xs text-gray-500">
                {isLoadingFaucetAmount ? (
                  "Loading faucet amount..."
                ) : !faucetInfo.canRequestNow && faucetInfo.nextAvailableDate ? (
                  <>
                    <span className="text-amber-600 font-medium">Available in: </span>
                    <CountdownTimer
                      targetDate={new Date(faucetInfo.nextAvailableDate)}
                      onComplete={() => {
                        // Updates the state to enable the button when the timer ends
                        const newFaucetInfo = { ...faucetInfo, canRequestNow: true };
                        setFaucetInfo(newFaucetInfo);
                      }}
                    />
                  </>
                ) : faucetAmount ? (
                  `Get ${faucetAmount.amount} ${faucetAmount.currency} tokens every day`
                ) : (
                  "Get your free tokens every day"
                )}
              </p>
              {claimingFaucet && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg backdrop-blur-[1px]">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-700"></div>
                </div>
              )}
            </Button>
            {faucetInfo.canRequestNow && import.meta.env.MODE !== "testing" && (
              <div className="flex justify-center">
                <ReCAPTCHA
                  sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}
                  onChange={setRecaptchaToken}
                  onExpired={() => setRecaptchaToken(null)}
                  ref={recaptchaRef}
                />
              </div>
            )}
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

export default FundWalletDialog;

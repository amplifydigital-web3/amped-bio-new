import { Gift, ArrowLeftRight, Zap, ArrowRight, Check } from "lucide-react";
import CoinbaseIcon from "@/assets/icons/coinbase.png";
import MoonpayIcon from "@/assets/icons/moonpay.png";
import OnRampIcon from "@/assets/icons/onramp.png";
import { useState, useEffect } from "react";
import { useFundWalletDialog } from "../hooks/useFundWalletDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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
  openReceiveModal: () => void;
}

function FundWalletDialog({ open, onOpenChange, openReceiveModal }: FundWalletDialogProps) {
  const {
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
  });

  const [rewardClaimed, setRewardClaimed] = useState(!faucetInfo.canRequestNow);

  useEffect(() => {
    setRewardClaimed(!faucetInfo.canRequestNow);
  }, [faucetInfo.canRequestNow]);

  const handleClaimDailyReward = async () => {
    await handleClaim();
    setRewardClaimed(true);
  };

  const handleBridge = () => {
    window.open(
      "https://bridge.dev.revolutionchain.io/bridge?address=" + (walletAddress || ""),
      "_blank",
      "width=600,height=700,left=200,top=200"
    );
  };

  const handleManualDeposit = () => {
    onOpenChange(false);
    openReceiveModal();
  };

  return (
    <>
      {/* Main Dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md rounded-xl p-0 bg-white">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Fund Your Account</h2>
          </div>
          <div className="rounded-xl shadow-2xl max-w-md w-full p-6">
            {/* Modal Content */}
            <div className="space-y-4">
              {/* Daily Reward Notification Bar */}
              <div
                className={`rounded-lg p-4  transition-all duration-500 ${
                  rewardClaimed
                    ? "bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 "
                    : "bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-2 rounded-lg transition-all duration-300 ${
                        rewardClaimed ? "bg-blue-100 animate-bounce" : "bg-green-100"
                      }`}
                    >
                      {rewardClaimed ? (
                        <Check className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Gift className="w-5 h-5 text-green-600" />
                      )}
                    </div>
                    <div>
                      <h3
                        className={`font-semibold transition-colors duration-300 ${
                          rewardClaimed ? "text-blue-900" : "text-green-900"
                        }`}
                      >
                        {isLoadingFaucetAmount
                          ? "Loading Faucet Info..."
                          : !faucetInfo.faucetEnabled
                            ? "Faucet Temporarily Disabled"
                            : !faucetInfo.hasSufficientFunds
                              ? "Faucet Out of Funds"
                              : faucetInfo.canRequestNow
                                ? "Daily Reward Available!"
                                : "Faucet on Cooldown"}
                      </h3>
                      <p
                        className={`text-sm transition-colors duration-300 ${
                          rewardClaimed ? "text-blue-700" : "text-green-700"
                        }`}
                      >
                        {isLoadingFaucetAmount ? (
                          "Loading faucet amount..."
                        ) : !faucetInfo.faucetEnabled ? (
                          "The faucet is temporarily disabled. Please check back later."
                        ) : !faucetInfo.hasSufficientFunds ? (
                          "The faucet is temporarily out of funds. Please check back later."
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
                    </div>
                  </div>
                  <button
                    onClick={handleClaimDailyReward}
                    disabled={
                      !faucetInfo.faucetEnabled || claimingFaucet || !faucetInfo.canRequestNow || !faucetInfo.hasSufficientFunds
                    }
                    className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center space-x-2 ${
                      !faucetInfo.faucetEnabled
                        ? "bg-gray-400 text-white cursor-not-allowed"
                        : !faucetInfo.canRequestNow
                          ? "bg-blue-600 text-white cursor-default"
                          : claimingFaucet || !faucetInfo.hasSufficientFunds
                            ? "bg-gray-400 text-white cursor-not-allowed"
                            : "bg-green-600 hover:bg-green-700 text-white hover:scale-105"
                    }`}
                  >
                    {claimingFaucet ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Claiming...</span>
                      </>
                    ) : !faucetInfo.faucetEnabled ? (
                      <>
                        <Gift className="w-4 h-4" />
                        <span>Disabled</span>
                      </>
                    ) : !faucetInfo.canRequestNow ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Claimed!</span>
                      </>
                    ) : !faucetInfo.hasSufficientFunds ? (
                      <>
                        <Gift className="w-4 h-4" />
                        <span>Out of Funds</span>
                      </>
                    ) : (
                      <>
                        <Gift className="w-4 h-4" />
                        <span>Claim</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Bridge */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
                <button
                  onClick={handleBridge}
                  disabled={true}
                  className="w-full flex items-center justify-between opacity-50 cursor-not-allowed"
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <ArrowLeftRight className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900 flex items-center">
                        Bridge{" "}
                        <span className="ml-2 px-2 py-1 text-xs font-semibold text-white bg-blue-500 rounded-full">
                          Soon
                        </span>
                      </h3>
                      <p className="text-sm text-gray-600">Bridge from another chain</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Centralized Exchange */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
                <button
                  onClick={handleManualDeposit}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-yellow-100 rounded-lg">
                      <Zap className="w-6 h-6 text-yellow-600" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900">Centralized Exchange</h3>
                      <p className="text-sm text-gray-600">Transfer from a centralized exchange</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Coinbase */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
                <button
                  disabled={true}
                  className="w-full flex items-center justify-between opacity-50 cursor-not-allowed"
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <img src={CoinbaseIcon} alt="Coinbase" className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900 flex items-center">
                        Coinbase{" "}
                        <span className="ml-2 px-2 py-1 text-xs font-semibold text-white bg-blue-500 rounded-full">
                          Soon
                        </span>
                      </h3>
                      <p className="text-sm text-gray-600">Instant · Fees 0.5 — 2.5%</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Moonpay */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
                <button
                  disabled={true}
                  className="w-full flex items-center justify-between opacity-50 cursor-not-allowed"
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <img src={MoonpayIcon} alt="Moonpay" className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900 flex items-center">
                        Moonpay{" "}
                        <span className="ml-2 px-2 py-1 text-xs font-semibold text-white bg-blue-500 rounded-full">
                          Soon
                        </span>
                      </h3>
                      <p className="text-sm text-gray-600">Instant · Fees 0.5 — 2.5%</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* OnRamp */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
                <button
                  disabled={true}
                  className="w-full flex items-center justify-between opacity-50 cursor-not-allowed"
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <img src={OnRampIcon} alt="OnRamp" className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900 flex items-center">
                        OnRamp{" "}
                        <span className="ml-2 px-2 py-1 text-xs font-semibold text-white bg-blue-500 rounded-full">
                          Soon
                        </span>
                      </h3>
                      <p className="text-sm text-gray-600">Instant · Fees 0.5 — 2.5%</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>
            {/* Footer */}
            <div className="p-6 pt-6 text-center">
              <button
                onClick={handleManualDeposit}
                className="text-sm text-gray-600 hover:text-gray-800 underline transition-colors duration-200"
              >
                Deposit Funds Manually
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default FundWalletDialog;

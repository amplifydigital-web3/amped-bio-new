import {
  Gift,
  ArrowLeftRight,
  Zap,
  ArrowRight,
  Check,
  Clock,
  Send,
  ExternalLink,
  Loader2,
  Info,
  CircleDollarSign,
} from "lucide-react";
import { ONRAMP_COPY } from "@repo/constants";
import { TESTNET_NOTICE } from "@repo/ui";
import { USDC_SYMBOL } from "@repo/web3";
import { USDC_FLAGS } from "@/config/usdc/flags";
import { paymentChain } from "@/utils/paymentChain";
import type { ReceiveNetwork } from "./ReceiveDialog";
import CoinbaseIcon from "@/assets/icons/coinbase.png";
import MoonpayIcon from "@/assets/icons/moonpay.png";
import OnRampIcon from "@/assets/icons/onramp.png";
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { useFundWalletDialog } from "../hooks/useFundWalletDialog";
import { Dialog, DialogContent } from "@repo/ui";
import { FaucetRequirementsChecklist } from "./FaucetRequirementsChecklist";

// Component to display countdown timer
function CountdownTimer({ targetDate, onComplete }: { targetDate: Date; onComplete?: () => void }) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
  }>({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = targetDate.getTime() - new Date().getTime();
      if (difference <= 0) return { hours: 0, minutes: 0, seconds: 0 };
      const hours = Math.floor(difference / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);
      return { hours, minutes, seconds };
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      const timeRemaining = calculateTimeLeft();
      setTimeLeft(timeRemaining);
      if (timeRemaining.hours === 0 && timeRemaining.minutes === 0 && timeRemaining.seconds === 0) {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate, onComplete]);

  const formatTime = (num: number) => num.toString().padStart(2, "0");

  return (
    <span className="font-mono">
      {formatTime(timeLeft.hours)}:{formatTime(timeLeft.minutes)}:{formatTime(timeLeft.seconds)}
    </span>
  );
}

// Component to show countdown to next batch send time
function BatchCountdown({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const calculate = () => {
      const diff = targetDate.getTime() - new Date().getTime();
      if (diff <= 0) return "Any moment now";
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    };

    setTimeLeft(calculate());
    const timer = setInterval(() => setTimeLeft(calculate()), 60_000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return <span>{timeLeft}</span>;
}

interface FundWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens Receive. Deposit USDC passes "payment" so it lands on the USDC chain (137 w5). */
  openReceiveModal: (network?: ReceiveNetwork) => void;
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
    claimStatus,
    queueStatus,
    isInstant,
    txInfo,
  } = useFundWalletDialog({
    open,
    onOpenChange,
  });

  const [showRequirementsModal, setShowRequirementsModal] = useState(false);

  const allRequirementsMet =
    faucetInfo.requirements.photo &&
    faucetInfo.requirements.background &&
    faucetInfo.requirements.bio &&
    faucetInfo.requirements.minLinks;

  const handleClaimDailyReward = async () => {
    await handleClaim();
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

  // Render the daily reward card content based on claim status
  // The faucet pays testnet tREVO; the chain's own symbol names it
  const currency = faucetAmount?.currency ?? "tREVO";

  const renderDailyRewardCard = () => {
    // ── INSTANT SUCCESS ──
    if (claimStatus === "instant") {
      return (
        <div className="rounded-lg p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 transition-all duration-500">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Send className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-green-900">{currency} sent</h3>
              <p className="text-sm text-green-700">
                Your {faucetAmount?.amount} {currency} is on its way to your wallet.
              </p>
            </div>
          </div>
          <div className="bg-white/60 rounded-lg p-3 border border-green-200">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-green-800 leading-relaxed">
                Your first {currency} goes out at once so you can start exploring. Later
                claims join the daily batch.
              </p>
            </div>
          </div>
        </div>
      );
    }

    // ── QUEUED FOR BATCH ──
    if (claimStatus === "queued" && queueStatus) {
      const estimatedDate = new Date(queueStatus.estimatedTime);
      return (
        <div className="rounded-lg p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 transition-all duration-500">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900">Queued for Batch Processing</h3>
              <p className="text-sm text-blue-700">
                Position #{queueStatus.position} of {queueStatus.totalInBatch}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {/* Progress bar */}
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    ((queueStatus.position - 1) / Math.max(queueStatus.totalInBatch, 1)) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-blue-600">
              <span>Waiting for batch...</span>
              <span className="font-medium">
                <BatchCountdown targetDate={estimatedDate} />
              </span>
            </div>
            {/* Explanation tooltip */}
            <div className="bg-white/60 rounded-lg p-3 border border-blue-200 mt-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-800 leading-relaxed">
                  <strong>Why a batch?</strong> You already hold {currency}, so this claim goes out
                  with the next daily batch in one network transaction.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── COOLDOWN (already claimed) ──
    if (claimStatus === "cooldown" || (!faucetInfo.canRequestNow && claimStatus !== "queued")) {
      return (
        <div className="rounded-lg p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 transition-all duration-500">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-100 animate-bounce">
              <Check className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900">Claimed today</h3>
              <p className="text-sm text-blue-700">You can claim again after the timer ends.</p>
              {faucetInfo.nextAvailableDate && (
                <p className="text-xs text-amber-600 font-medium mt-1">
                  Next claim in:{" "}
                  <CountdownTimer
                    targetDate={new Date(faucetInfo.nextAvailableDate)}
                    onComplete={() => {
                      setFaucetInfo(prev => ({ ...prev, canRequestNow: true }));
                    }}
                  />
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── IDLE (ready to claim) ──
    return (
      <div className="rounded-lg p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 transition-all duration-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Gift className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-green-900">
                {isLoadingFaucetAmount
                  ? "Loading..."
                  : !faucetInfo.faucetEnabled
                    ? "Faucet Temporarily Disabled"
                    : !faucetInfo.hasSufficientFunds
                      ? "Faucet Out of Funds"
                      : "Daily Reward Available!"}
              </h3>
              <p className="text-sm text-green-700">
                {isLoadingFaucetAmount
                  ? "Loading faucet amount..."
                  : !faucetInfo.faucetEnabled
                    ? "The faucet is temporarily disabled. Please check back later."
                    : !faucetInfo.hasSufficientFunds
                      ? "The faucet is temporarily out of funds. Please check back later."
                      : faucetAmount
                    ? `Get ${faucetAmount.amount} ${faucetAmount.currency} every day`
                    : "Get your free tokens every day"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClaimDailyReward}
            disabled={
              !faucetInfo.faucetEnabled ||
              claimingFaucet ||
              !faucetInfo.canRequestNow ||
              !faucetInfo.hasSufficientFunds ||
              !allRequirementsMet
            }
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center space-x-2 ${
              !faucetInfo.faucetEnabled
                ? "bg-gray-400 text-white cursor-not-allowed"
                : claimingFaucet || !faucetInfo.hasSufficientFunds || !allRequirementsMet
                  ? "bg-gray-400 text-white cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white hover:scale-105"
            }`}
          >
            {claimingFaucet ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Claiming...</span>
              </>
            ) : !faucetInfo.faucetEnabled ? (
              <>
                <Gift className="w-4 h-4" />
                <span>Disabled</span>
              </>
            ) : !faucetInfo.hasSufficientFunds ? (
              <>
                <Gift className="w-4 h-4" />
                <span>Out of Funds</span>
              </>
            ) : !allRequirementsMet ? (
              <>
                <Gift className="w-4 h-4" />
                <span>Complete Profile</span>
              </>
            ) : (
              <>
                <Gift className="w-4 h-4" />
                <span>Claim</span>
              </>
            )}
          </button>
        </div>
        {/* Instant/Batch badge */}
        {!isLoadingFaucetAmount && faucetInfo.canRequestNow && faucetInfo.faucetEnabled && (
          <div className="mt-3">
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                isInstant
                  ? "bg-green-100 text-green-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {isInstant ? (
                <>Instant: your first {currency}</>
              ) : (
                <>Daily batch: you already hold {currency}</>
              )}
            </span>
          </div>
        )}
      </div>
    );
  };

  const navigate = useNavigate();
  const location = useLocation();
  // Screen Review 138 (o1): Buy USDC opens in the Wallet. From anywhere else the
  // fan comes back to where they were once the USDC arrives (Back to the item).
  const handleBuyUsdc = () => {
    onOpenChange(false);
    const here = `${location.pathname}${location.search}`;
    const next = new URLSearchParams({ fund: "usdc" });
    if (location.pathname !== "/wallet") next.set("return", here);
    navigate(`/wallet?${next.toString()}`);
  };

  const handleUsdcDeposit = () => {
    onOpenChange(false);
    openReceiveModal("payment");
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
              {renderDailyRewardCard()}
              {/* BRIEF rule 2 (#446): wherever tREVO shows, the testnet line is TESTNET_NOTICE */}
              <p className="text-xs text-gray-600">{TESTNET_NOTICE}</p>

              {/* Requirements */}
              {!isLoadingFaucetAmount && faucetInfo.faucetEnabled && claimStatus === "idle" && (
                <button
                  onClick={() => setShowRequirementsModal(true)}
                  className={`w-full rounded-lg p-3 text-sm font-medium transition-colors ${
                    allRequirementsMet
                      ? "bg-green-50 border border-green-200 text-green-700 hover:bg-green-100"
                      : "bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  {allRequirementsMet
                    ? "✓ Profile complete — faucet unlocked"
                    : "Complete your profile to unlock the faucet →"}
                </button>
              )}

              {/* Buy USDC through Coinbase (Screen Review 138, board w5) */}
              {USDC_FLAGS.onramp && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
                  <button
                    onClick={handleBuyUsdc}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <img src={CoinbaseIcon} alt="" aria-hidden className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold text-gray-900">Buy {USDC_SYMBOL}</h3>
                        <p className="text-sm text-gray-600">{ONRAMP_COPY.fundRow}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              )}

              {/* Deposit USDC (Screen Review 137, board w5): opens Receive on the payment chain */}
              {USDC_FLAGS.wallet && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow duration-200">
                  <button
                    onClick={handleUsdcDeposit}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="p-2 bg-indigo-100 rounded-lg">
                        <CircleDollarSign className="w-6 h-6 text-indigo-600" />
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold text-gray-900">Deposit {USDC_SYMBOL}</h3>
                        <p className="text-sm text-gray-600">
                          From an exchange or another wallet, on {paymentChain.name}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              )}

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

              {/* Coinbase: replaced by Buy USDC when the on-ramp is on */}
              {!USDC_FLAGS.onramp && (
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
              )}

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
              {/* View on Explorer link for successful claims */}
              {(claimStatus === "instant") && txInfo?.txid && (
                <a
                  href={`https://libertas.revoscan.io/tx/${txInfo.txid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View transaction on explorer
                </a>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Requirements Modal */}
      <Dialog open={showRequirementsModal} onOpenChange={setShowRequirementsModal}>
        <DialogContent className="max-w-md rounded-xl p-0 bg-white">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Profile Requirements</h2>
          </div>
          <div className="p-6">
            <FaucetRequirementsChecklist
              requirements={faucetInfo.requirements}
              onActionClick={() => setShowRequirementsModal(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default FundWalletDialog;
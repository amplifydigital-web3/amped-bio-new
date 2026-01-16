import React, { useState, useEffect } from "react";
import { Coins, TrendingUp, AlertCircle, Check } from "lucide-react";
import { useAccount, useBalance } from "wagmi";
import { getChainConfig } from "@ampedbio/web3";
import { useStakingManager } from "@/hooks/useStakingManager";
import { formatNumberWithSeparators } from "@/utils/numberUtils";
import { useWalletContext } from "@/contexts/WalletContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface UnstakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: {
    id: number;
    name: string; // Blockchain pool name (primary)
    description: string;
    chainId: string;
    address: string; // Adding address for the staking hook
    image: {
      id: number;
      url: string;
    } | null;
    currentStake?: number;
  } | null;
  onStakeSuccess?: () => void; // Callback for when stake/unstake completes to trigger refresh
}

export default function UnstakeModal({ isOpen, onClose, pool, onStakeSuccess }: UnstakeModalProps) {
  const { isWeb3Wallet } = useWalletContext();
  // Get the chain configuration once to avoid multiple calls
  const chainConfig = pool ? getChainConfig(parseInt(pool.chainId)) : null;
  const currencySymbol = chainConfig?.nativeCurrency.symbol || "REVO";

  // Use the staking hook with our pool data
  const {
    isStaking,
    stakeActionError,
    unstake: handleUnstake,
  } = useStakingManager(
    pool ? { id: pool.id, chainId: pool.chainId, address: pool.address } : null,
    onStakeSuccess
  );

  const [step, setStep] = useState<"amount" | "confirm" | "staking" | "success">("amount");
  const [amount, setAmount] = useState("");

  // Get user account and balance
  const { address: userAddress } = useAccount();
  const { data: balanceData, isLoading: isBalanceLoading } = useBalance({
    address: userAddress,
    token: undefined, // This will use the native token (REVO in this case)
    query: {
      refetchInterval: 10000, // Refresh every 10 seconds
    },
  });

  useEffect(() => {
    if (isOpen) {
      setStep("amount");
      setAmount("");
    }
  }, [isOpen]);

  if (!isOpen || !pool) return null;

  const handleUnstakeClick = async () => {
    const numericAmount = parseFloat(amount) || 0;
    if (numericAmount > (pool?.currentStake || 0)) {
      const error = `Unstake amount exceeds current stake. Current stake: ${formatNumberWithSeparators(pool?.currentStake || 0)} ${currencySymbol}`;
      console.error(error);
      throw new Error(error);
    }

    setStep("staking");

    try {
      await handleUnstake(amount);

      setStep("success");

      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (error) {
      console.error("Error during unstaking:", error);
      setStep("amount");
    }
  };

  const handleClose = () => {
    if (step !== "staking") {
      onClose();
    }
  };

  const numericAmount = parseFloat(amount) || 0;
  const isValidAmount = numericAmount > 0 && numericAmount <= (pool?.currentStake || 0);
  const canProceed = isValidAmount;
  const hasInsufficientStake = numericAmount > (pool?.currentStake || 0);

  const renderAmountStep = () => (
    <>
      <DialogHeader className="p-6 pb-4 border-b border-gray-200">
        <DialogTitle className="text-xl font-bold text-gray-900">Reduce Stake</DialogTitle>
      </DialogHeader>

      <div className="p-6 space-y-6">
        <div className="flex items-center space-x-4 p-4 rounded-lg">
          <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-shrink-0">
            {pool.image ? (
              <img
                src={pool.image.url || ""}
                alt={`${pool.name} pool`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                <Coins className="w-6 h-6 text-gray-500" />
              </div>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{pool.name}</h3>
            <p className="text-sm text-gray-600">Staking Pool</p>
          </div>
        </div>

        <div className="border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Coins className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">Current Stake</span>
            </div>
            <span className="text-lg font-bold text-green-900">
              {formatNumberWithSeparators(pool.currentStake || 0)} {currencySymbol}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amount to Unstake</label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className={`w-full px-4 py-4 text-2xl font-bold text-center border rounded-xl focus:ring-2 focus:border-transparent transition-all duration-200 ${
                amount && !isValidAmount
                  ? "border-red-300 focus:ring-red-500"
                  : "border-gray-300 focus:ring-blue-500"
              }`}
            />
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
              {currencySymbol}
            </div>
          </div>

          <div className="flex space-x-2 mt-3">
            {[25, 50, 75, 100].map(percentage => {
              const quickAmount = ((pool.currentStake || 0) * percentage) / 100;
              return (
                <button
                  key={percentage}
                  onClick={() => setAmount(quickAmount.toString())}
                  className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors duration-200 text-sm"
                >
                  {percentage}%
                </button>
              );
            })}
          </div>
        </div>

        {amount && (
          <div className="space-y-2">
            {!isValidAmount && (
              <div className="flex items-center space-x-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>
                  {hasInsufficientStake
                    ? `Insufficient stake: ${formatNumberWithSeparators(pool?.currentStake || 0)} ${currencySymbol} staked`
                    : "Please enter a valid amount"}
                </span>
              </div>
            )}

            {canProceed && (
              <div className="flex items-center space-x-2 text-green-600 text-sm">
                <Check className="w-4 h-4" />
                <span>Ready to unstake</span>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {stakeActionError && (
            <div className="p-3 border border-red-200 rounded-lg">
              <div className="flex items-center space-x-2 text-red-700">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">{stakeActionError}</span>
              </div>
            </div>
          )}

          {(pool?.currentStake || 0) <= 0 && (
            <div className="p-3 border border-red-200 rounded-lg">
              <div className="flex items-center space-x-2 text-red-700">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">
                  You have no stake in this pool to unstake
                </span>
              </div>
            </div>
          )}

          <button
            onClick={() => setStep("confirm")}
            disabled={
              !isWeb3Wallet ||
              !canProceed ||
              !pool?.address ||
              !!isStaking ||
              (pool?.currentStake || 0) <= 0
            }
            className={`w-full py-4 font-semibold rounded-xl transition-all duration-200 ${
              isWeb3Wallet &&
              canProceed &&
              !isStaking &&
              pool?.address &&
              (pool?.currentStake || 0) > 0
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            {(pool?.currentStake || 0) <= 0
              ? "No stake to unstake"
              : !pool?.address
                ? "Unstaking not available"
                : isStaking
                  ? "Processing..."
                  : "Continue"}
          </button>
        </div>
      </div>
    </>
  );

  const renderConfirmStep = () => (
    <>
      <DialogHeader className="p-6 pb-4 border-b border-gray-200">
        <DialogTitle className="text-xl font-bold text-gray-900">Confirm Unstake</DialogTitle>
      </DialogHeader>

      <div className="p-6 space-y-4">
        <div className="flex items-center space-x-3 p-3 rounded-lg">
          <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-shrink-0">
            {pool.image ? (
              <img
                src={pool.image.url!}
                alt={`${pool.name} pool`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                <Coins className="w-5 h-5 text-gray-500" />
              </div>
            )}
          </div>
          <div>
            <h3 className="font-medium text-gray-900 text-sm">{pool.name}</h3>
            <p className="text-xs text-gray-600">Staking Pool</p>
          </div>
        </div>

        <div className="text-center py-4">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
            <TrendingUp className="w-6 h-6 text-blue-600 transform scale-x-[-1]" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-1">
            {formatNumberWithSeparators(amount)} {currencySymbol}
          </h3>
          <p className="text-gray-600">Amount to unstake</p>
        </div>

        <div className="border border-blue-200 rounded-lg p-3 space-y-2">
          <h4 className="font-medium text-blue-900 text-sm">Transaction Summary</h4>

          <div className="flex justify-between text-sm">
            <span className="text-blue-700">Unstake Amount:</span>
            <span className="font-medium text-blue-900">
              {formatNumberWithSeparators(amount)} {currencySymbol}
            </span>
          </div>

          <div className="flex justify-between text-sm border-t border-blue-200 pt-1">
            <span className="text-blue-700">New Total Stake:</span>
            <span className="font-bold text-blue-900">
              {formatNumberWithSeparators(
                Math.max(0, (pool.currentStake || 0) - parseFloat(amount))
              )}{" "}
              {currencySymbol}
            </span>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-3">
          <h4 className="font-medium text-gray-900 text-sm mb-2">Network Fee</h4>
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">Gas Fee:</span>
            <span className="font-medium text-gray-900">0.01 REVO</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Estimated network fee for this transaction
          </div>
        </div>

        <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-yellow-800 text-sm">Important Notice</h4>
              <p className="text-yellow-700 text-xs mt-1">
                Unstaking any amount will also automatically claim whatever rewards you are
                currently owed in this pool.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex space-x-3">
          <button
            onClick={() => setStep("amount")}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors duration-200"
          >
            Back
          </button>
          <button
            onClick={handleUnstakeClick}
            disabled={hasInsufficientStake}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-2 ${
              hasInsufficientStake
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            <TrendingUp className="w-4 h-4 transform scale-x-[-1]" />
            <span>{hasInsufficientStake ? "Invalid Unstake" : "Confirm Unstake"}</span>
          </button>
        </DialogFooter>
      </div>
    </>
  );

  const renderStakingStep = () => (
    <>
      <DialogHeader className="p-6 pb-4 border-b border-gray-200">
        <DialogTitle className="text-xl font-bold text-gray-900">Processing Unstake</DialogTitle>
      </DialogHeader>

      <div className="p-6 flex flex-col items-center justify-center" style={{ minHeight: "400px" }}>
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mb-6"></div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Unstaking Tokens</h3>
        <p className="text-gray-600 text-center">
          {`Returning ${formatNumberWithSeparators(amount)} ${currencySymbol} to your wallet...`}
        </p>
      </div>
    </>
  );

  const renderSuccessStep = () => (
    <>
      <DialogHeader className="p-6 pb-4 border-b border-gray-200">
        <DialogTitle className="text-xl font-bold text-green-900">Unstake Successful!</DialogTitle>
      </DialogHeader>

      <div className="p-6 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4 animate-pulse">
          <Check className="w-12 h-12 text-green-600" />
        </div>

        <div>
          <h3 className="text-2xl font-bold text-green-900 mb-2">Unstaking Complete!</h3>
          <p className="text-gray-600 mb-4">
            You've successfully unstaked{" "}
            <strong>
              {formatNumberWithSeparators(amount)} {currencySymbol}
            </strong>{" "}
            from {pool.name}
          </p>
        </div>

        <div className="border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-700">Your Total Stake</span>
            <span className="text-lg font-bold text-green-900">
              {formatNumberWithSeparators(
                Math.max(0, (pool.currentStake || 0) - parseFloat(amount))
              )}{" "}
              {currencySymbol}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-green-600">
            <TrendingUp className="w-4 h-4" />
            <span>Tokens have been returned to your wallet!</span>
          </div>
        </div>

        <p className="text-xs text-gray-500">This window will close automatically...</p>
      </div>
    </>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open && step !== "staking") {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {step === "amount" && renderAmountStep()}
        {step === "confirm" && renderConfirmStep()}
        {step === "staking" && renderStakingStep()}
        {step === "success" && renderSuccessStep()}
      </DialogContent>
    </Dialog>
  );
}

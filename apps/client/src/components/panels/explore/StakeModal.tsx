import React, { useState, useEffect } from "react";
import { X, Coins, TrendingUp, AlertCircle, Check } from "lucide-react";
import { useAccount, useBalance } from "wagmi";
import { getChainConfig } from "@ampedbio/web3";
import { useStakingManager } from "@/hooks/useStakingManager";
import { formatNumberWithSeparators } from "@/utils/numberUtils";
import Decimal from "decimal.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface StakingPoolData {
  id: number;
  chainId: string;
  address: string;
}

interface StakeModalProps {
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
  mode: "stake" | "add-stake";
  onStakeSuccess?: () => void; // Callback for when stake completes to trigger refresh
}

export default function StakeModal({
  isOpen,
  onClose,
  pool,
  mode,
  onStakeSuccess,
}: StakeModalProps) {
  // Get the chain configuration once to avoid multiple calls
  const chainConfig = pool ? getChainConfig(parseInt(pool.chainId)) : null;
  const currencySymbol = chainConfig?.nativeCurrency.symbol || "REVO";

  // Use the staking hook with our pool data
  const {
    isStaking,
    stakeActionError,
    stake: handleStake,
  } = useStakingManager(
    pool ? { id: pool.id, chainId: pool.chainId, address: pool.address } : null,
    onStakeSuccess
  );

  const [step, setStep] = useState<"amount" | "confirm" | "staking" | "success">("amount");
  const [amount, setAmount] = useState("");
  const [animatingTokens, setAnimatingTokens] = useState<Array<{ id: number; delay: number }>>([]);

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
      setAnimatingTokens([]);
    }
  }, [isOpen]);

  if (!isOpen || !pool) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && step !== "staking") {
      onClose();
    }
  };

  const handleStakeClick = async () => {
    setStep("staking");

    try {
      await handleStake(amount);

      // If successful, proceed to success step
      setStep("success");

      // Auto-close after showing success
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (error) {
      console.error("Error during staking:", error);
      // In case of error, we should go back to the amount step or show an error
      // For now, we'll just go back to the amount step
      setStep("amount");
      // Optionally show an error message to the user
    }
  };

  const handleClose = () => {
    if (step !== "staking") {
      onClose();
    }
  };

  const numericAmount = amount ? new Decimal(amount).toNumber() : 0;
  const userBalance = new Decimal(balanceData?.formatted || 0);
  const isValidAmount = amount
    ? new Decimal(amount).gt(0) && new Decimal(amount).lte(userBalance)
    : false;
  const canProceed = isValidAmount;

  const renderAmountStep = () => (
    <>
      <DialogHeader className="p-6 pb-4 border-b border-gray-200">
        <DialogTitle className="text-xl font-bold text-gray-900">
          {mode === "stake" ? "Stake to Pool" : "Add to Stake"}
        </DialogTitle>
      </DialogHeader>

      <div className="p-6 space-y-6">
        {/* Pool Info */}
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

        {/* Balance Display */}
        <div className="border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Coins className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">Available Balance</span>
            </div>
            <span className="text-lg font-bold text-green-900">
              {isBalanceLoading
                ? "Loading..."
                : `${formatNumberWithSeparators(balanceData?.formatted || 0)} ${balanceData?.symbol || currencySymbol}`}
            </span>
          </div>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount to {mode === "stake" ? "Stake" : "Add"}
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={e => {
                // Limit input to 4 decimal places using decimal.js for precision
                const inputValue = e.target.value;
                if (inputValue) {
                  // Check if the input has more than 4 decimal places
                  const parts = inputValue.split(".");
                  if (parts.length === 2 && parts[1].length > 4) {
                    // Use decimal.js to handle the precision
                    try {
                      const decimalValue = new Decimal(inputValue);
                      const fixedValue = decimalValue.toFixed(4).replace(/\.?0+$/, "");
                      setAmount(fixedValue);
                    } catch (error) {
                      // If decimal parsing fails, just set the original value
                      setAmount(inputValue);
                    }
                  } else {
                    setAmount(inputValue);
                  }
                } else {
                  setAmount(inputValue);
                }
              }}
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

          {/* Quick Amount Buttons */}
          <div className="flex space-x-2 mt-3">
            {[25, 50, 75, 100].map(percentage => {
              const balanceValue = new Decimal(balanceData?.formatted || 0);
              let quickAmount;

              if (percentage === 100) {
                // For 100%, subtract 0.0015 ETH from the balance to leave some for gas
                quickAmount = balanceValue.minus(new Decimal("0.0015"));
                // Ensure the amount doesn't go below 0
                if (quickAmount.lt(0)) {
                  quickAmount = new Decimal(0);
                }
              } else {
                const percentageDecimal = new Decimal(percentage);
                quickAmount = balanceValue.times(percentageDecimal).div(100);
              }

              // Limit to 4 decimal places for all quick amounts to ensure precision consistency
              const formattedAmount = quickAmount.toFixed(4).replace(/\.?0+$/, "");
              return (
                <button
                  key={percentage}
                  onClick={() => setAmount(formattedAmount)}
                  className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors duration-200 text-sm"
                >
                  {percentage}%
                </button>
              );
            })}
          </div>
        </div>

        {/* Validation Messages */}
        {amount && (
          <div className="space-y-2">
            {!isValidAmount && (
              <div className="flex items-center space-x-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>
                  {amount && new Decimal(amount).gt(userBalance)
                    ? `Insufficient balance: ${formatNumberWithSeparators(userBalance.toString())} ${balanceData?.symbol || currencySymbol} available`
                    : "Please enter a valid amount"}
                </span>
              </div>
            )}

            {canProceed && (
              <div className="flex items-center space-x-2 text-green-600 text-sm">
                <Check className="w-4 h-4" />
                <span>Ready to stake</span>
              </div>
            )}
          </div>
        )}

        {/* Stake Button with Error Display */}
        <div className="space-y-3">
          {stakeActionError && (
            <div className="p-3 border border-red-200 rounded-lg">
              <div className="flex items-center space-x-2 text-red-700">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">{stakeActionError}</span>
              </div>
            </div>
          )}

          <button
            onClick={() => setStep("confirm")}
            disabled={!canProceed || isBalanceLoading || !pool?.address || !!isStaking}
            className={`w-full py-4 font-semibold rounded-xl transition-all duration-200 ${
              canProceed && !isBalanceLoading && !isStaking && pool?.address
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            {!pool?.address
              ? "Staking not available"
              : isStaking
                ? "Processing..."
                : isBalanceLoading
                  ? "Loading balance..."
                  : "Continue"}
          </button>

          {/* Show reasons why the button is disabled */}
          {!canProceed && (
            <div className="text-sm text-gray-500">
              {amount && new Decimal(amount).lte(0) ? (
                <div className="flex items-center space-x-1">
                  <AlertCircle className="w-4 h-4" />
                  <span>Please enter an amount</span>
                </div>
              ) : amount && new Decimal(amount).gt(userBalance) ? (
                <div className="flex items-center space-x-1">
                  <AlertCircle className="w-4 h-4" />
                  <span>Insufficient balance</span>
                </div>
              ) : null}
            </div>
          )}

          {/* Show error if functions are not provided */}
          {!pool?.address && (
            <div className="text-sm text-red-500 flex items-center space-x-1">
              <AlertCircle className="w-4 h-4" />
              <span>Staking functionality not available for this pool</span>
            </div>
          )}
        </div>
      </div>
    </>
  );

  const renderConfirmStep = () => (
    <>
      <DialogHeader className="p-6 pb-4 border-b border-gray-200">
        <DialogTitle className="text-xl font-bold text-gray-900">Confirm Stake</DialogTitle>
      </DialogHeader>

      <div className="p-6 space-y-4">
        {/* Pool Info */}
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

        {/* Stake Amount */}
        <div className="text-center py-4">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
            <Coins className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-1">
            {amount ? formatNumberWithSeparators(amount) : "0"} {currencySymbol}
          </h3>
          <p className="text-gray-600">
            {mode === "stake" ? "Initial stake amount" : "Additional stake amount"}
          </p>
        </div>

        {/* Transaction Summary */}
        <div className="border border-blue-200 rounded-lg p-3 space-y-2">
          <h4 className="font-medium text-blue-900 text-sm">Transaction Summary</h4>

          <div className="flex justify-between text-sm">
            <span className="text-blue-700">Stake Amount:</span>
            <span className="font-medium text-blue-900">
              {amount ? formatNumberWithSeparators(amount) : "0"} {currencySymbol}
            </span>
          </div>

          {pool.currentStake !== undefined && (
            <div className="flex justify-between text-sm">
              <span className="text-blue-700">Current Stake:</span>
              <span className="font-medium text-blue-900">
                {new Decimal(pool.currentStake.toString())
                  .div(new Decimal(10).pow(18))
                  .toFixed(4)
                  .replace(/\.?0+$/, "")}{" "}
                {currencySymbol}
              </span>
            </div>
          )}

          <div className="flex justify-between text-sm border-t border-blue-200 pt-1">
            <span className="text-blue-700">New Total Stake:</span>
            <span className="font-bold text-blue-900">
              {new Decimal(pool.currentStake?.toString() ?? "0")
                .div(new Decimal(10).pow(18))
                .plus(amount ? new Decimal(amount) : new Decimal(0))
                .toFixed(4)
                .replace(/\.?0+$/, "")}{" "}
              {currencySymbol}
            </span>
          </div>
        </div>

        {/* Gas Fee Section */}
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

        {/* Action Buttons */}
        <DialogFooter className="flex space-x-3">
          <button
            onClick={() => setStep("amount")}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors duration-200"
          >
            Back
          </button>
          <button
            onClick={handleStakeClick}
            className="flex-1 px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Coins className="w-4 h-4" />
            <span>Confirm Stake</span>
          </button>
        </DialogFooter>
      </div>
    </>
  );

  const renderStakingStep = () => (
    <>
      <DialogHeader className="p-6 pb-4 border-b border-gray-200">
        <DialogTitle className="text-xl font-bold text-gray-900">Processing Stake</DialogTitle>
      </DialogHeader>

      <div className="p-6 flex flex-col items-center justify-center" style={{ minHeight: "400px" }}>
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mb-6"></div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Staking Tokens</h3>
        <p className="text-gray-600 text-center">
          {`Transferring ${amount ? formatNumberWithSeparators(amount) : "0"} ${currencySymbol} to the pool...`}
        </p>
      </div>
    </>
  );

  const renderSuccessStep = () => (
    <>
      <DialogHeader className="p-6 pb-4 border-b border-gray-200">
        <DialogTitle className="text-xl font-bold text-green-900">Stake Successful!</DialogTitle>
      </DialogHeader>

      <div className="p-6 text-center space-y-6">
        {/* Success Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4 animate-pulse">
          <Check className="w-12 h-12 text-green-600" />
        </div>

        {/* Success Message */}
        <div>
          <h3 className="text-2xl font-bold text-green-900 mb-2">Staking Complete!</h3>
          <p className="text-gray-600 mb-4">
            You've successfully staked{" "}
            <strong>
              {amount ? formatNumberWithSeparators(amount) : "0"} {currencySymbol}
            </strong>{" "}
            to {pool.name}
          </p>
        </div>

        {/* New Stake Info */}
        <div className="border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-700">Your Total Stake</span>
            <span className="text-lg font-bold text-green-900">
              {new Decimal(pool.currentStake?.toString() ?? "0")
                .div(new Decimal(10).pow(18))
                .plus(amount ? new Decimal(amount) : new Decimal(0))
                .toFixed(4)
                .replace(/\.?0+$/, "")}{" "}
              {currencySymbol}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-green-600">
            <TrendingUp className="w-4 h-4" />
            <span>You're now earning rewards from this pool!</span>
          </div>
        </div>

        {/* Auto-close notice */}
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

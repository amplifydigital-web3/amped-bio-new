import React, { useState, useEffect } from "react";
import { X, Coins, TrendingUp, Shield, AlertCircle, Check, Sparkles } from "lucide-react";
import { useAccount, useBalance } from "wagmi";
import { getChainConfig } from "@ampedbio/web3";

interface StakingModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: {
    id: number;
    title: string;
    description: string;
    chainId: string;
    imageUrl?: string | null;
    currentStake?: number;
  } | null;
  mode: "stake" | "add-stake" | "reduce-stake";
  onStake?: (amount: string) => Promise<void>;
  onUnstake?: (amount: string) => Promise<void>;
  isStaking?: boolean;
  stakeActionError?: string | null;
}

export default function StakingModal({ isOpen, onClose, pool, mode, onStake, onUnstake, isStaking, stakeActionError }: StakingModalProps) {
  // Get the chain configuration once to avoid multiple calls
  const chainConfig = pool ? getChainConfig(parseInt(pool.chainId)) : null;
  const currencySymbol = chainConfig?.nativeCurrency.symbol || "REVO";

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
    }
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

  const handleStake = async () => {
    setStep("staking");

    try {
      // Check if functions are provided before calling them
      if (mode === "reduce-stake") {
        if (onUnstake) {
          await onUnstake(amount);
        } else {
          console.error("Unstake function not provided");
          throw new Error("Unstake function not provided");
        }
      } else {
        if (onStake) {
          await onStake(amount);
        } else {
          console.error("Stake function not provided");
          throw new Error("Stake function not provided");
        }
      }
      
      // If successful, proceed to success step
      setStep("success");

      // Auto-close after showing success
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (error) {
      console.error("Error during staking/unstaking:", error);
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

  const numericAmount = parseFloat(amount) || 0;
  const userBalance = Number(balanceData?.formatted || 0);
  const isValidAmount = numericAmount > 0 && numericAmount <= userBalance;
  const canProceed = isValidAmount;

  const renderAmountStep = () => (
    <>
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">
          {mode === "stake" ? "Stake to Pool" : 
           mode === "add-stake" ? "Add to Stake" : 
           "Reduce Stake"}
        </h2>
        <button
          onClick={handleClose}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Pool Info */}
        <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
          <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-shrink-0">
            {pool.imageUrl ? (
              <img
                src={pool.imageUrl}
                alt={`${pool.title} pool`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                <Coins className="w-6 h-6 text-gray-500" />
              </div>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{pool.title}</h3>
            <p className="text-sm text-gray-600">Staking Pool</p>
          </div>
        </div>

        {/* Current Stake Info (for add-stake mode) */}
        {/* {mode === "add-stake" && pool.currentStake && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Current Stake</span>
            </div>
            <p className="text-lg font-bold text-blue-900">
              {pool.currentStake.toLocaleString()} {currencySymbol}
            </p>
          </div>
        )} */}

        {/* Balance Display */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Coins className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">Available Balance</span>
            </div>
            <span className="text-lg font-bold text-green-900">
              {isBalanceLoading 
                ? "Loading..." 
                : `${Number(balanceData?.formatted || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${balanceData?.symbol || currencySymbol}`
              }
            </span>
          </div>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Amount to {mode === "stake" ? "Stake" : 
                     mode === "add-stake" ? "Add" : 
                     "Unstake"}
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className={`w-full px-4 py-4 text-2xl font-bold text-center border rounded-xl focus:ring-2 focus:border-transparent transition-all duration-200 ${
                amount && !isValidAmount
                  ? "border-red-300 focus:ring-red-500 bg-red-50"
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
              const balanceValue = Number(balanceData?.formatted || 0);
              const quickAmount = (balanceValue * percentage) / 100;
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

        {/* Validation Messages */}
        {amount && (
          <div className="space-y-2">
            {!isValidAmount && (
              <div className="flex items-center space-x-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>
                  {numericAmount > userBalance
                    ? `Insufficient balance: ${userBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${balanceData?.symbol || currencySymbol} available`
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
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center space-x-2 text-red-700">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">{stakeActionError}</span>
              </div>
            </div>
          )}
          
          <button
            onClick={() => setStep("confirm")}
            disabled={(!canProceed || isBalanceLoading || !onStake) || !!isStaking}
            className={`w-full py-4 font-semibold rounded-xl transition-all duration-200 ${
              canProceed && !isBalanceLoading && !isStaking && onStake
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            {!onStake ? "Staking not available" : isStaking ? "Processing..." : isBalanceLoading ? "Loading balance..." : "Continue"}
          </button>
          
          {/* Show reasons why the button is disabled */}
          {!canProceed && (
            <div className="text-sm text-gray-500">
              {numericAmount <= 0 ? (
                <div className="flex items-center space-x-1">
                  <AlertCircle className="w-4 h-4" />
                  <span>Please enter an amount</span>
                </div>
              ) : numericAmount > userBalance ? (
                <div className="flex items-center space-x-1">
                  <AlertCircle className="w-4 h-4" />
                  <span>Insufficient balance</span>
                </div>
              ) : null}
            </div>
          )}
          
          {/* Show error if functions are not provided */}
          {!onStake && (
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
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">
          {mode === "reduce-stake" ? "Confirm Unstake" : "Confirm Stake"}
        </h2>
        <button
          onClick={() => setStep("amount")}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        {/* Pool Info */}
        <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
          <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-shrink-0">
            {pool.imageUrl ? (
              <img
                src={pool.imageUrl}
                alt={`${pool.title} pool`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                <Coins className="w-5 h-5 text-gray-500" />
              </div>
            )}
          </div>
          <div>
            <h3 className="font-medium text-gray-900 text-sm">{pool.title}</h3>
            <p className="text-xs text-gray-600">Staking Pool</p>
          </div>
        </div>

        {/* Stake/Unstake Amount */}
        <div className="text-center py-4">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
            {mode === "reduce-stake" ? 
              <TrendingUp className="w-6 h-6 text-blue-600 transform scale-x-[-1]" /> : 
              <Coins className="w-6 h-6 text-blue-600" />}
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-1">
            {parseFloat(amount).toLocaleString()} {currencySymbol}
          </h3>
          <p className="text-gray-600">
            {mode === "stake" ? "Initial stake amount" : 
             mode === "add-stake" ? "Additional stake amount" : 
             "Amount to unstake"}
          </p>
        </div>

        {/* Transaction Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          <h4 className="font-medium text-blue-900 text-sm">Transaction Summary</h4>

          <div className="flex justify-between text-sm">
            <span className="text-blue-700">
              {mode === "reduce-stake" ? "Unstake Amount:" : "Stake Amount:"}
            </span>
            <span className="font-medium text-blue-900">
              {parseFloat(amount).toLocaleString()} {currencySymbol}
            </span>
          </div>

          {mode !== "reduce-stake" && pool.currentStake && (
            <div className="flex justify-between text-sm">
              <span className="text-blue-700">Current Stake:</span>
              <span className="font-medium text-blue-900">
                {pool.currentStake.toLocaleString()} {currencySymbol}
              </span>
            </div>
          )}

          {mode !== "reduce-stake" && (
            <div className="flex justify-between text-sm border-t border-blue-200 pt-1">
              <span className="text-blue-700">New Total Stake:</span>
              <span className="font-bold text-blue-900">
                {((pool.currentStake || 0) + parseFloat(amount)).toLocaleString()}{" "}
                {currencySymbol}
              </span>
            </div>
          )}

          {mode === "reduce-stake" && pool.currentStake && (
            <div className="flex justify-between text-sm border-t border-blue-200 pt-1">
              <span className="text-blue-700">New Total Stake:</span>
              <span className="font-bold text-blue-900">
                {Math.max(0, (pool.currentStake || 0) - parseFloat(amount)).toLocaleString()}{" "}
                {currencySymbol}
              </span>
            </div>
          )}
        </div>

        {/* Gas Fee Section */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
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
        <div className="flex space-x-3">
          <button
            onClick={() => setStep("amount")}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors duration-200"
          >
            Back
          </button>
          <button
            onClick={handleStake}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            {mode === "reduce-stake" ? <TrendingUp className="w-4 h-4 transform scale-x-[-1]" /> : <Coins className="w-4 h-4" />}
            <span>{mode === "reduce-stake" ? "Confirm Unstake" : "Confirm Stake"}</span>
          </button>
        </div>
      </div>
    </>
  );

  const renderStakingStep = () => (
    <>
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">
          {mode === "reduce-stake" ? "Processing Unstake" : "Processing Stake"}
        </h2>
      </div>

      <div className="p-6 relative overflow-hidden" style={{ minHeight: "400px" }}>
        {/* Wallet Icon - Source */}
        <div className="absolute top-8 left-1/4 transform -translate-x-1/2">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center border-4 border-white shadow-lg">
            <Coins className="w-8 h-8 text-green-600" />
          </div>
        </div>

        {/* Pool Icon - Destination */}
        <div className="absolute bottom-8 right-1/4 transform translate-x-1/2">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center border-4 border-white shadow-lg">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        {/* Animated Tokens */}
        {animatingTokens.map(token => (
          <div
            key={token.id}
            className="absolute w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg animate-token-stake"
            style={{
              animationDelay: `${token.delay}ms`,
            }}
          >
            🚀
          </div>
        ))}

        {/* Center Content */}
        <div className="flex flex-col items-center justify-center h-full pt-16 pb-16">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-6"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {mode === "reduce-stake" ? "Unstaking Tokens" : "Staking Tokens"}
          </h3>
          <p className="text-gray-600 text-center">
            {mode === "reduce-stake" 
              ? `Returning ${parseFloat(amount).toLocaleString()} ${currencySymbol} to your wallet...` 
              : `Transferring ${parseFloat(amount).toLocaleString()} ${currencySymbol} to the pool...`}
          </p>
        </div>

        {/* Sparkle Effects */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <Sparkles
              key={i}
              className="absolute w-4 h-4 text-blue-400 animate-pulse"
              style={{
                top: `${15 + i * 12}%`,
                left: `${10 + i * 12}%`,
                animationDelay: `${i * 300}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </>
  );

  const renderSuccessStep = () => (
    <>
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <h2 className="text-xl font-bold text-green-900">
          {mode === "reduce-stake" ? "Unstake Successful!" : "Stake Successful!"}
        </h2>
      </div>

      <div className="p-6 text-center space-y-6">
        {/* Success Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4 animate-pulse">
          <Check className="w-12 h-12 text-green-600" />
        </div>

        {/* Success Message */}
        <div>
          <h3 className="text-2xl font-bold text-green-900 mb-2">
            {mode === "reduce-stake" ? "Unstaking Complete!" : "Staking Complete!"}
          </h3>
          <p className="text-gray-600 mb-4">
            You've successfully{" "}
            {mode === "reduce-stake" ? "unstaked " : "staked "}
            <strong>
              {parseFloat(amount).toLocaleString()} {currencySymbol}
            </strong>
            {mode === "reduce-stake" ? " from " : " to "}{pool.title}
          </p>
        </div>

        {/* New Stake Info */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-700">Your Total Stake</span>
            <span className="text-lg font-bold text-green-900">
              {mode === "reduce-stake" 
                ? Math.max(0, (pool.currentStake || 0) - parseFloat(amount)).toLocaleString() 
                : ((pool.currentStake || 0) + parseFloat(amount)).toLocaleString()}{" "}
              {currencySymbol}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-green-600">
            <TrendingUp className="w-4 h-4" />
            <span>
              {mode === "reduce-stake" 
                ? "Tokens have been returned to your wallet!" 
                : "You're now earning rewards from this pool!"}
            </span>
          </div>
        </div>

        {/* Auto-close notice */}
        <p className="text-xs text-gray-500">This window will close automatically...</p>
      </div>
    </>
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        {step === "amount" && renderAmountStep()}
        {step === "confirm" && renderConfirmStep()}
        {step === "staking" && renderStakingStep()}
        {step === "success" && renderSuccessStep()}
      </div>
    </div>
  );
}

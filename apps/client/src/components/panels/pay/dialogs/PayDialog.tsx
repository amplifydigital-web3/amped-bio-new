import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Check,
  Wallet,
} from "lucide-react";
import { formatEther } from "viem";
import { useWalletContext } from "@/contexts/WalletContext";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import SentLottie from "@/assets/lottie/sent.lottie";
import { UsePayDialogReturns } from "@/hooks/usePayDialog";

interface PayModalProps {
  hook: UsePayDialogReturns;
}

const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export default function PayModal({ hook }: PayModalProps) {
  const [note, setNote] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<"REVO" | "ETH" | "NFT">("REVO");
  const [step, setStep] = useState<"amount" | "confirm" | "sending" | "success" | "error">("amount");

  const wallet = useWalletContext();

  // Reset step when transaction status changes
  useEffect(() => {
    if (hook.transactionStatus === "loading") {
      setStep("sending");
    } else if (hook.transactionStatus === "success") {
      setStep("success");
    } else if (hook.transactionStatus === "error") {
      setStep("error");
    } else if (hook.transactionStatus === "idle") {
      setStep("amount");
    }
  }, [hook.transactionStatus]);

  // Reset form and step when dialog opens/closes
  useEffect(() => {
    if (!hook.isOpen) {
      setTimeout(() => {
        setStep("amount");
        setNote("");
        setSelectedAsset("REVO");
      }, 300); // Delay to allow closing animation
    }
  }, [hook.isOpen]);

  const renderAmountStep = () => (
    <>
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900">
          Send to Address
        </h2>
        <button onClick={hook.closePayDialog} className="p-2 hover:bg-gray-100 rounded-full">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-xl">
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
            <Wallet className="w-6 h-6 text-gray-500" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-gray-900">
                {hook.sendAddress ? truncateAddress(hook.sendAddress) : "Enter address"}
              </span>
            </div>
            <span className="text-sm text-gray-600">Ethereum Address</span>
          </div>
        </div> */}

        {/* Address Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Recipient Address</label>
          <input
            type="text"
            {...hook.register("address")}
            placeholder="0x..."
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          {hook.errors.address && (
            <p className="text-red-500 text-xs mt-1">{hook.errors.address.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Select Asset</label>
          <div className="grid grid-cols-3 gap-3">
            {(["REVO", "ETH", "NFT"] as const).map(asset => {
              const isSoon = asset === "ETH" || asset === "NFT";
              return (
                <button
                  key={asset}
                  onClick={() => !isSoon && setSelectedAsset(asset)}
                  disabled={isSoon}
                  className={`relative p-3 rounded-lg border-2 transition-colors flex flex-col items-center ${
                    selectedAsset === asset && !isSoon
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300"
                  } ${isSoon ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <div className="text-lg mb-1">
                    {asset === "REVO" ? "🚀" : asset === "ETH" ? "⟠" : "🖼️"}
                  </div>
                  <div className="text-sm font-medium">{asset}</div>
                  {isSoon && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full flex items-center">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selectedAsset !== "NFT" && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Amount</label>
              {hook.maxSendableAmount && parseFloat(hook.maxSendableAmount) > 0 && (
                <button
                  onClick={hook.handleSendAll}
                  disabled={hook.isCalculatingMaxAmount}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                >
                  {hook.isCalculatingMaxAmount ? "Calculating..." : "Max"}
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                {...hook.register("amount")}
                placeholder="0.00"
                className="w-full px-4 py-3 text-2xl font-bold text-center border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                step="0.000000000000000001"
                min="0"
              />
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                {selectedAsset}
              </div>
            </div>
            {hook.errors.amount && (
              <p className="text-red-500 text-xs mt-1 text-center">{hook.errors.amount.message}</p>
            )}
            {wallet.balance?.data?.formatted && (
              <p className="text-gray-500 text-xs mt-1 text-center">
                Balance: {parseFloat(wallet.balance.data.formatted).toFixed(8)} REVO
              </p>
            )}
          </div>
        )}

        <button
          onClick={() => setStep("confirm")}
          disabled={!hook.isValid || !hook.sendAddress || !hook.sendAmount}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors"
        >
          Continue
        </button>
      </div>
    </>
  );

  const renderConfirmStep = () => (
    <>
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900">Confirm Payment</h2>
        <button onClick={() => setStep("amount")} className="p-2 hover:bg-gray-100 rounded-full">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Sending:</span>
            <span className="font-medium text-gray-900">
              {hook.sendAmount} REVO
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">To:</span>
            <span className="font-mono text-gray-900 text-xs">
              {hook.sendAddress ? truncateAddress(hook.sendAddress) : ""}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Network Fee:</span>
            <span className="font-medium text-gray-900">
              ~{hook.estimatedGasFee ? parseFloat(hook.estimatedGasFee).toFixed(8) : '...'} REVO
            </span>
          </div>
          <div className="flex justify-between font-medium pt-2 border-t border-gray-200">
            <span className="text-gray-800">Total Cost:</span>
            <span className="text-gray-900">
              {(parseFloat(hook.sendAmount || "0") + parseFloat(hook.estimatedGasFee || "0")).toFixed(8)} REVO
            </span>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={() => setStep("amount")}
            className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={hook.handleSendTransaction}
            disabled={hook.isPending}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-xl transition-colors"
          >
            {hook.isPending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </>
  );

  const renderSendingStep = () => (
    <div className="p-6 text-center py-16">
      <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-6"></div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">Sending...</h3>
      <p className="text-gray-600">Processing your payment</p>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="p-6 text-center py-16">
      <div className="w-24 h-24 mx-auto mb-4">
        <DotLottieReact src={SentLottie} autoplay />
      </div>
      <h3 className="text-xl font-semibold text-green-900 mb-2">Sent!</h3>
      <p className="text-gray-600">
        Payment sent to {hook.sendAddress ? truncateAddress(hook.sendAddress) : ""}
      </p>
      {hook.transactionHash && (
        <a
          href={`https://dev.revoscan.io/tx/${hook.transactionHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline mt-2 inline-block"
        >
          View on explorer
        </a>
      )}
    </div>
  );

  const renderErrorStep = () => (
    <div className="p-6 text-center py-16">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <X className="w-8 h-8 text-red-600" />
      </div>
      <h3 className="text-xl font-semibold text-red-900 mb-2">Transaction Failed</h3>
      <p className="text-gray-600 text-sm max-w-xs mx-auto">
        {hook.error?.message.includes("insufficient funds")
          ? "Insufficient funds for gas fee and amount."
          : hook.error?.message ?? "An unknown error occurred."}
      </p>
      <button
        onClick={() => {
          setStep("amount");
          hook.setTransactionStatus("idle");
        }}
        className="mt-6 px-4 py-2 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
      >
        Try Again
      </button>
    </div>
  );

  if (!hook.isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden">
        {step === "amount" && renderAmountStep()}
        {step === "confirm" && renderConfirmStep()}
        {step === "sending" && renderSendingStep()}
        {step === "success" && renderSuccessStep()}
        {step === "error" && renderErrorStep()}
      </div>
    </div>
  );
}
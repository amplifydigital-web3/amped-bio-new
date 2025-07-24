import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowUpRight, DollarSign, User, Wallet, X, Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useBalance, useAccount, useSendTransaction, useFeeData } from "wagmi";
import { parseEther, formatEther } from "viem";
import { z } from "zod";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import SentLottie from "@/assets/lottie/sent.lottie";

interface SendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend?: (address: string, amount: string) => void;
}

// Zod schema for transaction validation
const createTransactionSchema = (maxAmount: string = "0") => {
  return z.object({
    address: z
      .string()
      .trim()
      .min(1, { message: "Address is required" })
      .regex(/^0x[a-fA-F0-9]{40}$/, {
        message: "Invalid Ethereum address format. Must start with 0x and be 42 characters long.",
      }),
    amount: z
      .string()
      .min(1, { message: "Amount is required" })
      .refine(val => !isNaN(parseFloat(val)), {
        message: "Amount must be a valid number",
      })
      .refine(val => parseFloat(val) > 0, {
        message: "Amount must be greater than 0",
      })
      .refine(
        val => {
          // Check if the number has more than 18 decimal places
          const decimalPart = val.includes(".") ? val.split(".")[1] : "";
          return decimalPart.length <= 18;
        },
        {
          message: "Maximum of 18 decimal places allowed",
        }
      )
      .refine(val => parseFloat(val) <= parseFloat(maxAmount || "0"), {
        message: "Insufficient balance",
      }),
  });
};

// Type for the form data
type TransactionFormData = z.infer<ReturnType<typeof createTransactionSchema>>;

interface UseSendDialogOptions {
  onSuccess?: (data: { address: string; amount: string }) => void;
}

// Custom hook to manage dialog state and transaction logic
function useSendDialog(options?: UseSendDialogOptions) {
  // Dialog state
  const [isOpen, setIsOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [estimatedGasFee, setEstimatedGasFee] = useState<string | null>(null);

  // Use wagmi hooks to get wallet data
  const { address } = useAccount();
  const { data: balanceData, isLoading: isBalanceLoading } = useBalance({
    address,
  });

  // Get fee data for gas estimation
  const { data: feeData } = useFeeData();

  // Create schema with current max balance
  const transactionSchema = useMemo(
    () => createTransactionSchema(balanceData?.formatted),
    [balanceData?.formatted]
  );

  // Set up form with zod validation
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isValid },
    watch,
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    mode: "onChange",
    defaultValues: {
      address: "",
      amount: "",
    },
  });

  // Watch form values
  const sendAddress = watch("address");
  const sendAmount = watch("amount");

  // Calculate estimated gas fee when inputs are valid
  useEffect(() => {
    const calculateGasFee = async () => {
      if (sendAddress && sendAmount && feeData?.gasPrice) {
        try {
          // Estimate gas cost: use a simple fixed gas limit for ETH transfer (21000)
          // For more accuracy, you could use estimateGas from a provider
          const gasLimit = BigInt(21000);
          const gasCost = gasLimit * feeData.gasPrice;

          // Format the gas cost to ETH with up to 18 decimal places
          const formattedGasCost = formatEther(gasCost);
          setEstimatedGasFee(formattedGasCost);
        } catch (error) {
          console.error("Error estimating gas fee:", error);
          setEstimatedGasFee(null);
        }
      } else {
        setEstimatedGasFee(null);
      }
    };

    calculateGasFee();
  }, [sendAddress, sendAmount, feeData?.gasPrice]);

  // Parse Ether value to bigint only if inputs are valid
  const parsedAmount = useMemo(() => {
    try {
      return sendAddress && sendAmount && isValid ? parseEther(sendAmount) : undefined;
    } catch (e) {
      return undefined;
    }
  }, [sendAddress, sendAmount, isValid]);

  // Configure send transaction with proper error handling
  const {
    data: sendTxData,
    sendTransaction,
    isPending: isSendPending,
    isSuccess: isSendSuccess,
    error: sendError,
  } = useSendTransaction();

  // Handle transaction state updates
  useEffect(() => {
    if (isSendPending) {
      setTransactionStatus("loading");
    } else if (isSendSuccess && sendTxData) {
      setTransactionHash(sendTxData);
      setTransactionStatus("success");

      // Call external success callback if provided
      if (options?.onSuccess && sendAddress && sendAmount) {
        options.onSuccess({ address: sendAddress, amount: sendAmount });
      }

      // Reset form after successful transaction
      setTimeout(() => {
        reset();
        setIsOpen(false);
      }, 3000); // Give user time to see success state
    } else if (sendError) {
      console.error("Transaction failed:", sendError);
      setTransactionStatus("error");
    }
  }, [
    isSendPending,
    isSendSuccess,
    sendError,
    sendTxData,
    sendAddress,
    sendAmount,
    options,
    reset,
    setIsOpen,
  ]);

  // Handle sending max amount
  const handleSendAll = () => {
    if (balanceData?.formatted) {
      setValue("amount", balanceData.formatted, { shouldValidate: true });
    }
  };

  // Handle form submission
  const handleSendTransaction = handleSubmit(data => {
    if (!sendTransaction || !parsedAmount) return;

    setTransactionStatus("loading");

    // Execute transaction with proper parameters
    sendTransaction({
      to: data.address as `0x${string}`,
      value: parsedAmount,
    });
  });

  // Open dialog function
  const openSendDialog = () => {
    setIsOpen(true);
    setTransactionStatus("idle");
    setTransactionHash(null);
    setEstimatedGasFee(null);
    reset();
  };

  // Close dialog function
  const closeSendDialog = () => {
    setIsOpen(false);
    setTransactionStatus("idle");
    setTransactionHash(null);
    setEstimatedGasFee(null);
    reset();
  };

  return {
    // State
    isOpen,
    setIsOpen,
    transactionStatus,
    setTransactionStatus,
    transactionHash,
    balanceData,
    isBalanceLoading,
    estimatedGasFee,

    // Form
    register,
    errors,
    isValid,
    sendAddress,
    sendAmount,

    // Actions
    openSendDialog,
    closeSendDialog,
    handleSendTransaction,
    handleSendAll,

    // Transaction state
    isSendPending,
    isSendSuccess,
    sendError,

    // Utils
    setValue,
    reset,
  };
}

export function SendDialog({ open, onOpenChange, onSend }: SendDialogProps) {
  // Use our custom hook for dialog and transaction management
  const {
    balanceData,
    isBalanceLoading,
    register,
    errors,
    isValid,
    sendAddress,
    sendAmount,
    handleSendAll,
    handleSendTransaction,
    transactionStatus,
    setTransactionStatus,
    transactionHash,
    sendError,
    estimatedGasFee,
    reset,
  } = useSendDialog({
    onSuccess: data => {
      if (onSend) {
        onSend(data.address, data.amount);
      }
    },
  });

  // Handle closing dialog
  const handleClose = () => {
    onOpenChange(false);
    reset();
  };

  // Handle dialog open/close events and reset states
  useEffect(() => {
    // Reset form and transaction status when dialog state changes
    reset();
    setTransactionStatus("idle");
  }, [open, reset, setTransactionStatus]);

  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) {
          // Reset states when dialog is closed
          reset();
          setTransactionStatus("idle");
        }
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <ArrowUpRight className="w-5 h-5 text-blue-600" />
            <span>Send REVO</span>
          </DialogTitle>
          <DialogDescription>
            Send REVO tokens to another wallet address securely.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSendTransaction} className="space-y-6">
          {/* Current Balance Card */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-blue-700">Available Balance</span>
              <div className="flex items-center space-x-1">
                <Wallet className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-blue-900">
                  {balanceData?.formatted || "0"} {balanceData?.symbol || "REVO"}
                </span>
              </div>
            </div>
            {sendAmount && (
              <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                <span className="text-sm font-medium text-blue-700">After Transaction</span>
                <span className="font-semibold text-blue-900">
                  {balanceData?.formatted && sendAmount
                    ? (parseFloat(balanceData.formatted) - parseFloat(sendAmount))
                        .toFixed(18)
                        .replace(/\.?0+$/, "")
                    : "0"}{" "}
                  {balanceData?.symbol || "REVO"}
                </span>
              </div>
            )}
          </div>

          {/* Recipient Address */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-900">Recipient Address</label>
            <div className="relative w-full">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Enter wallet address (0x...)"
                {...register("address")}
                className="w-full pl-10 pr-10 font-mono text-sm h-12 border-2 focus:border-blue-500 bg-gray-50 focus:bg-white transition-all duration-200"
              />
            </div>
            {errors.address && (
              <p className="text-red-500 text-xs flex items-center space-x-1">
                <X className="w-3 h-3" />
                <span>{errors.address.message}</span>
              </p>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-900">
              Amount ({balanceData?.symbol ?? "REVO"})
            </label>
            <div className="relative w-full">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="number"
                placeholder="0.000000000000000000"
                {...register("amount")}
                step="0.000000000000000001"
                min="0"
                max={balanceData?.formatted ?? "0"}
                className="w-full pl-10 pr-20 h-12 text-lg font-semibold border-2 focus:border-blue-500 bg-gray-50 focus:bg-white transition-all duration-200"
              />
              <Button
                onClick={handleSendAll}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs px-3 py-1 h-8 bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 rounded-md font-medium"
                variant="outline"
                size="sm"
              >
                MAX
              </Button>
            </div>
            {errors.amount && (
              <p className="text-red-500 text-xs flex items-center space-x-1">
                <X className="w-3 h-3" />
                <span>{errors.amount.message}</span>
              </p>
            )}
          </div>

          {/* Transaction Summary */}
          {sendAmount && sendAddress && isValid && (
            <div className="bg-green-50 rounded-xl p-4 border border-green-200">
              <h3 className="font-medium text-green-800 mb-2">Transaction Summary</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Sending:</span>
                  <span className="font-medium text-gray-900">
                    {parseFloat(sendAmount)
                      .toFixed(18)
                      .replace(/\.?0+$/, "")}{" "}
                    {balanceData?.symbol ?? "REVO"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">To:</span>
                  <span className="font-mono text-gray-900 text-xs">
                    {sendAddress.substring(0, 6)}...
                    {sendAddress.substring(sendAddress.length - 4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Network Fee:</span>
                  <span className="font-medium text-gray-900">
                    ~{estimatedGasFee || "0.000000000000000100"} REVO
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Status indicator */}
          {transactionStatus === "loading" && (
            <div className="flex items-center justify-center p-3 bg-blue-50 rounded-lg">
              <div className="animate-spin h-5 w-5 text-blue-600 mr-3 border-2 border-blue-600 border-t-transparent rounded-full" />
              <span className="text-blue-800 font-medium">Processing transaction...</span>
            </div>
          )}

          {transactionStatus === "success" && (
            <div className="flex items-center justify-center p-3 bg-green-50 rounded-lg">
              <div className="flex items-center">
                <DotLottieReact
                  src={SentLottie}
                  loop
                  autoplay
                  style={{
                    width: "32px",
                    height: "32px",
                    marginLeft: "-3px",
                    marginTop: "-3px",
                  }}
                />
                <span className="text-green-800 font-medium ml-2">
                  Transaction sent successfully!
                  {transactionHash && (
                    <a
                      href={`https://dev.revoscan.io/tx/${transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 underline"
                    >
                      View on Revoscan
                    </a>
                  )}
                </span>
              </div>
            </div>
          )}

          {transactionStatus === "error" && (
            <div className="flex items-center p-3 bg-red-50 rounded-lg">
              <X className="h-5 w-5 text-red-600 mr-3 flex-shrink-0" />
              <div className="text-red-800">
                <p className="font-medium">Transaction failed</p>
                <p className="text-xs mt-1">
                  {sendError && sendError.message
                    ? sendError.message.includes("insufficient funds")
                      ? "Insufficient funds for gas fee and amount."
                      : sendError.message.length > 100
                        ? `${sendError.message.substring(0, 100)}...`
                        : sendError.message
                    : "Please check your wallet and try again."}
                </p>
              </div>
            </div>
          )}

          <div className="flex space-x-3 pt-2">
            <Button className="w-full" variant="outline" onClick={handleClose} type="button">
              Cancel
            </Button>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!isValid || transactionStatus === "loading"}
              type="submit"
            >
              Send Now
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

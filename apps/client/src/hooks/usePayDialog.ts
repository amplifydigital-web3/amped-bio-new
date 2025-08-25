import { useState, useMemo, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSendTransaction, useFeeData } from "wagmi";
import { parseEther, formatEther, Address } from "viem";
import { z } from "zod";
import { useWalletContext } from "@/contexts/WalletContext";

// Zod schema for transaction validation
export const createTransactionSchema = (maxAmount: string = "0") => {
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
export type TransactionFormData = z.infer<ReturnType<typeof createTransactionSchema>>;

interface UsePayDialogOptions {
  onSuccess?: (data: { hash: string; address: string; amount: string }) => void;
}

// Custom hook to manage dialog state and transaction logic
const usePayDialog = (options?: UsePayDialogOptions) => {
  const wallet = useWalletContext();

  // Dialog state
  const [isOpen, setIsOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [estimatedGasFee, setEstimatedGasFee] = useState<string | null>(null);
  const [isCalculatingMaxAmount, setIsCalculatingMaxAmount] = useState(false);

  // Get fee data for gas estimation
  const { data: feeData } = useFeeData();

  // Create schema with current max balance
  const transactionSchema = useMemo(
    () => createTransactionSchema(wallet.balance?.data?.formatted),
    [wallet.balance?.data?.formatted]
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

  // Calculate gas fee
  const calculateGasFee = useMemo(() => {
    if (!feeData?.gasPrice) return null;

    const gasLimit = BigInt(21000); // Standard ETH transfer gas limit
    const gasCost = gasLimit * feeData.gasPrice;
    return formatEther(gasCost);
  }, [feeData?.gasPrice]);

  // Memoized max sendable amount (balance - gas fee)
  const maxSendableAmount = useMemo(() => {
    if (!wallet.balance?.data?.formatted || !calculateGasFee) return null;

    const currentBalance = parseFloat(wallet.balance.data.formatted);
    const gasFeeInEth = parseFloat(calculateGasFee);

    // Calculate max sendable amount (balance - gas fee)
    const maxAmount = currentBalance - gasFeeInEth;

    // Ensure the amount is positive
    if (maxAmount > 0) {
      // Format to avoid floating point precision issues and limit to reasonable decimal places
      return maxAmount.toFixed(18).replace(/\.?0+$/, "");
    }

    return "0";
  }, [wallet.balance?.data?.formatted, calculateGasFee]);

  // Calculate estimated gas fee when inputs are valid
  useEffect(() => {
    const calculateEstimatedGasFee = async () => {
      if (sendAddress && sendAmount && calculateGasFee) {
        setEstimatedGasFee(calculateGasFee);
      } else {
        setEstimatedGasFee(null);
      }
    };

    calculateEstimatedGasFee();
  }, [sendAddress, sendAmount, calculateGasFee]);

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

  // Handle sending max amount with gas fee calculation
  const handleSendAll = async () => {
    if (!maxSendableAmount) return;

    setIsCalculatingMaxAmount(true);

    try {
      // Use the memoized max sendable amount
      setValue("amount", maxSendableAmount, { shouldValidate: true });
    } catch (error) {
      console.error("Error setting max amount:", error);
      // Fallback to original behavior if calculation fails
      if (wallet.balance?.data?.formatted) {
        setValue("amount", wallet.balance.data.formatted, { shouldValidate: true });
      }
    } finally {
      setIsCalculatingMaxAmount(false);
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
  const openPayDialog = (address?: Address) => {
    setIsOpen(true);
    setTransactionStatus("idle");
    setTransactionHash(null);
    setEstimatedGasFee(null);
    reset();
    // Set initial address if provided
    if (address) {
      setValue("address", address, { shouldValidate: true });
    }
  };

  // Close dialog function
  const closePayDialog = useCallback(() => {
    setIsOpen(false);
    setTransactionStatus("idle");
    setTransactionHash(null);
    setEstimatedGasFee(null);
    reset();
  }, [reset]);

  // Handle transaction state updates
  useEffect(() => {
    if (isSendPending) {
      setTransactionStatus("loading");
    } else if (isSendSuccess && sendTxData) {
      setTransactionHash(sendTxData);
      setTransactionStatus("success");

      // Call external success callback if provided
      if (options?.onSuccess && sendAddress && sendAmount) {
        options.onSuccess({ hash: sendTxData, address: sendAddress, amount: sendAmount });
      }

      // Update balance after successful transaction
      wallet.updateBalanceDelayed();

      // Auto-close dialog after 3 seconds
      setTimeout(() => {
        closePayDialog();
      }, 3000);
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
    wallet,
    closePayDialog,
  ]);

  return {
    // Dialog state
    isOpen,
    setIsOpen,
    transactionStatus,
    setTransactionStatus,
    transactionHash,
    estimatedGasFee,
    isCalculatingMaxAmount,
    maxSendableAmount,

    // Form
    register,
    errors,
    isValid,
    sendAddress,
    sendAmount,
    setValue,
    reset,

    // Actions
    openPayDialog,
    closePayDialog,
    handleSendTransaction,
    handleSendAll,

    // Transaction state
    isPending: isSendPending,
    isSuccess: isSendSuccess,
    error: sendError,
  };
};

export type UsePayDialogReturns = ReturnType<typeof usePayDialog>;

export default usePayDialog;

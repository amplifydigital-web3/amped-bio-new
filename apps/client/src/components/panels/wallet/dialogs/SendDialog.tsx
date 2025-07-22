import React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowUpRight, DollarSign, User, Wallet, X } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useBalance, useAccount } from "wagmi";

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
      .refine(val => parseFloat(val) <= parseFloat(maxAmount || "0"), {
        message: "Insufficient balance",
      }),
  });
};

// Type for the form data
type TransactionFormData = z.infer<ReturnType<typeof createTransactionSchema>>;

export function SendDialog({ open, onOpenChange, onSend }: SendDialogProps) {
  // Use wagmi hooks to get wallet data
  const { address } = useAccount();
  const { data: balanceData, isLoading: isBalanceLoading } = useBalance({
    address,
  });

  // Create schema with current max balance
  const transactionSchema = React.useMemo(
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

  // Handle sending max amount
  const handleSendAll = () => {
    if (balanceData?.formatted) {
      setValue("amount", balanceData.formatted, { shouldValidate: true });
    }
  };

  // Handle form submission
  const handleSendNow = handleSubmit(data => {
    if (onSend) {
      onSend(data.address, data.amount);
      reset();
      // Optionally close the dialog after sending
      // onOpenChange(false);
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        <form onSubmit={handleSendNow} className="space-y-6">
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
                    ? (parseFloat(balanceData.formatted) - parseFloat(sendAmount)).toFixed(4)
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
                placeholder="0.0000"
                {...register("amount")}
                step="0.0001"
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
                    {sendAmount} {balanceData?.symbol ?? "REVO"}
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
                  <span className="font-medium text-gray-900">~0.0001 REVO</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-3 pt-2">
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
              type="button"
            >
              Cancel
            </Button>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!isValid}
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

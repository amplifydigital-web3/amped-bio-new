import { trpcClient } from "@/utils/trpc";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useAccount } from "wagmi";

export function useFundWalletDialog(params: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { open, onOpenChange } = params;
  const { address: walletAddress, isConnected } = useAccount();

  // Dialog state
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [txInfo, setTxInfo] = useState<{ txid: string }>();

  // Faucet state
  const [faucetAmount, setFaucetAmount] = useState<{ amount: number; currency: string } | null>(
    null
  );
  const [isLoadingFaucetAmount, setIsLoadingFaucetAmount] = useState(false);
  const [claimingFaucet, setClaimingFaucet] = useState(false);
  const [faucetInfo, setFaucetInfo] = useState<{
    lastRequestDate: Date | null;
    nextAvailableDate: Date | null;
    canRequestNow: boolean;
    hasWallet: boolean;
  }>({
    lastRequestDate: null,
    nextAvailableDate: null,
    canRequestNow: true,
    hasWallet: false,
  });

  // Fetch faucet amount when the dialog is opened
  useEffect(() => {
    const fetchFaucetAmount = async () => {
      if (!open) return;

      setIsLoadingFaucetAmount(true);
      try {
        const result = await trpcClient.wallet.getFaucetAmount.query();
        if (result.success) {
          setFaucetAmount({
            amount: result.amount,
            currency: result.currency,
          });
          setFaucetInfo({
            lastRequestDate: result.lastRequestDate ? new Date(result.lastRequestDate) : null,
            nextAvailableDate: result.nextAvailableDate ? new Date(result.nextAvailableDate) : null,
            canRequestNow: result.canRequestNow,
            hasWallet: result.hasWallet,
          });
        } else {
          toast.error("Unable to get faucet information. Please try again later.");
        }
      } catch (error: any) {
        console.error("Failed to fetch faucet amount:", error);
        toast.error(error.message || "Unable to get faucet information. Please try again later.");
      } finally {
        setIsLoadingFaucetAmount(false);
      }
    };

    fetchFaucetAmount();
  }, [open]);

  // Function to handle the faucet claim process
  const handleClaimDailyFaucet = async (): Promise<{ success: boolean; txid?: string }> => {
    if (!isConnected || claimingFaucet || !walletAddress) {
      toast.error("Wallet not connected or already claiming.");
      return { success: false };
    }

    setClaimingFaucet(true);
    try {
      const result = await trpcClient.wallet.requestAirdrop.mutate({
        address: walletAddress,
      });

      if (result.success && result.transaction?.hash) {
        setTxInfo({ txid: result.transaction.hash });
        setShowSuccessDialog(true);

        // Update faucet state after successful claim
        const now = new Date();
        const nextDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        setFaucetInfo({
          lastRequestDate: now,
          nextAvailableDate: nextDate,
          canRequestNow: false,
          hasWallet: true,
        });

        return { success: true, txid: result.transaction.hash };
      } else {
        toast.error(result.message || "Failed to claim faucet tokens.");
        return { success: false };
      }
    } catch (error: any) {
      console.error("Error claiming faucet tokens:", error);
      toast.error(error.message || "An unexpected error occurred.");
      return { success: false };
    } finally {
      setClaimingFaucet(false);
    }
  };

  return {
    open,
    onOpenChange,
    walletAddress,
    showSuccessDialog,
    setShowSuccessDialog,
    txInfo,
    faucetAmount,
    isLoadingFaucetAmount,
    claimingFaucet,
    faucetInfo,
    setFaucetInfo,
    handleClaim: handleClaimDailyFaucet, // Renamed for clarity in the hook return
  };
}

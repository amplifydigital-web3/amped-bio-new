import { useWalletContext } from "@/contexts/WalletContext";
import { trpcClient } from "@/utils/trpc";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useAccount } from "wagmi";
import { useWeb3Auth } from "@web3auth/modal/react";

export function useFundWalletDialog(params: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const wallet = useWalletContext();
  const { open, onOpenChange } = params;
  const { address: walletAddress, isConnected, chainId } = useAccount();
  const dataWeb3Auth = useWeb3Auth();

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
    hasSufficientFunds: boolean; // New state for faucet balance
  }>({
    lastRequestDate: null,
    nextAvailableDate: null,
    canRequestNow: true,
    hasWallet: false,
    hasSufficientFunds: true, // Default to true
  });

  // Fetch faucet amount when the dialog is opened
  useEffect(() => {
    const fetchFaucetAmount = async () => {
      if (!open) return;

      setIsLoadingFaucetAmount(true);
      try {
        const result = await trpcClient.wallet.getFaucetAmount.query({ chainId: chainId! });
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
            hasSufficientFunds: result.hasSufficientFunds, // Update based on API response
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
  }, [chainId, open]);

  // Function to handle the faucet claim process
  const handleClaim = async (): Promise<{ success: boolean; txid?: string }> => {
    if (!isConnected || claimingFaucet || !walletAddress) {
      toast.error("Wallet not connected or already claiming.");
      return { success: false };
    }

    // Prevent claim if faucet has insufficient funds
    if (!faucetInfo.hasSufficientFunds) {
      toast.error("The faucet is currently out of funds. Please try again later.");
      return { success: false };
    }

    setClaimingFaucet(true);
    try {
      const userInfo = await dataWeb3Auth.web3Auth?.getUserInfo();
      const idToken = userInfo?.idToken;

      if (!idToken) {
        toast.error("Could not get user session. Please try again.");
        return { success: false };
      }

      const result = await trpcClient.wallet.requestAirdrop.mutate({
        address: walletAddress,
        idToken,
        chainId: chainId!,
      });

      if (result.success && result.transaction?.hash) {
        setTxInfo({ txid: result.transaction.hash });
        setShowSuccessDialog(true);

        // Update faucet state after successful claim
        const now = new Date();
        const nextDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        setFaucetInfo(prev => ({
          ...prev,
          lastRequestDate: now,
          nextAvailableDate: nextDate,
          canRequestNow: false,
          hasWallet: true,
        }));

        wallet.updateBalanceDelayed();

        return { success: true, txid: result.transaction.hash };
      } else {
        toast.error(result.message || "Failed to claim faucet tokens.");
        return { success: false };
      }
    } catch (error: any) {
      // Handle specific error for insufficient funds
      if (error.data?.code === "FORBIDDEN") {
        toast.error("The faucet is out of funds. Please try again later.");
        setFaucetInfo(prev => ({ ...prev, hasSufficientFunds: false }));
      } else {
        console.error("Error claiming faucet tokens:", error);
        toast.error(error.message || "An unexpected error occurred.");
      }
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
    handleClaim,
  };
}

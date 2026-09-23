import { useWalletContext } from "@/contexts/WalletContext";
import { trpcClient } from "@repo/ui";
import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { useAccount } from "wagmi";
import { isForceMetamask } from "@/utils/auth";
import { DAILY_AIRDROP_COOLDOWN_MS } from "@repo/constants";

interface QueueStatus {
  position: number;
  totalInBatch: number;
  estimatedTime: string;
}

export function useFundWalletDialog(params: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const wallet = useWalletContext();
  const { open, onOpenChange } = params;
  const { address: walletAddress, isConnected, chainId } = useAccount();

  // Dialog state
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [txInfo, setTxInfo] = useState<{ txid: string }>();

  // Faucet state
  const [faucetAmount, setFaucetAmount] = useState<{ amount: number; currency: string } | null>(
    null
  );
  const [isLoadingFaucetAmount, setIsLoadingFaucetAmount] = useState(false);
  const [claimingFaucet, setClaimingFaucet] = useState(false);
  const [claimStatus, setClaimStatus] = useState<"idle" | "instant" | "queued" | "cooldown">("idle");
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [isInstant, setIsInstant] = useState(false);
  const [faucetInfo, setFaucetInfo] = useState<{
    lastRequestDate: Date | null;
    nextAvailableDate: Date | null;
    canRequestNow: boolean;
    hasWallet: boolean;
    hasSufficientFunds: boolean;
    faucetEnabled: boolean;
    requirements: {
      photo: boolean;
      background: boolean;
      bio: boolean;
      minLinks: boolean;
    };
    userQueueStatus: QueueStatus | null;
    estimatedBatchTime: string | null;
  }>({
    lastRequestDate: null,
    nextAvailableDate: null,
    canRequestNow: true,
    hasWallet: false,
    hasSufficientFunds: true,
    faucetEnabled: false,
    requirements: { photo: false, background: false, bio: false, minLinks: false },
    userQueueStatus: null,
    estimatedBatchTime: null,
  });

  const fetchFaucetData = useCallback(async () => {
    if (!open || !chainId) return;

    setIsLoadingFaucetAmount(true);
    try {
      const result = await trpcClient.dailyAirdrop.getDailyAirdropInfo.query({ chainId });
      setFaucetAmount({
        amount: result.amount,
        currency: result.currency,
      });
      setFaucetInfo({
        lastRequestDate: result.lastRequestDate ? new Date(result.lastRequestDate) : null,
        nextAvailableDate: result.nextAvailableDate ? new Date(result.nextAvailableDate) : null,
        canRequestNow: result.canRequestNow,
        hasWallet: result.hasWallet,
        hasSufficientFunds: result.hasSufficientFunds,
        faucetEnabled: result.faucetEnabled,
        requirements: result.requirements ?? { photo: false, background: false, bio: false, minLinks: false },
        userQueueStatus: result.userQueueStatus,
        estimatedBatchTime: result.estimatedBatchTime,
      });
      setIsInstant(result.isInstant ?? false);

      // Sync claim status with server state
      if (!result.canRequestNow && result.lastRequestDate) {
        setClaimStatus("cooldown");
      } else if (result.userQueueStatus) {
        setClaimStatus("queued");
        setQueueStatus(result.userQueueStatus);
      } else {
        setClaimStatus("idle");
      }
    } catch (error: any) {
      console.error("Failed to fetch faucet amount or status:", error);
      toast.error(error.message || "Unable to get faucet information. Please try again later.");
    } finally {
      setIsLoadingFaucetAmount(false);
    }
  }, [chainId, open]);

  // Fetch faucet data when dialog opens
  useEffect(() => {
    fetchFaucetData();
  }, [fetchFaucetData]);

  // Poll for queue status updates when queued
  useEffect(() => {
    if (!open || claimStatus !== "queued" || !chainId) return;

    const interval = setInterval(async () => {
      try {
        const result = await trpcClient.dailyAirdrop.getDailyAirdropInfo.query({ chainId });

        if (result.userQueueStatus) {
          setQueueStatus(result.userQueueStatus);
        } else {
          // Queue entry was processed — claimed!
          setClaimStatus("cooldown");
          setQueueStatus(null);
          wallet.updateBalanceDelayed();
          toast.success("Your daily reward has been sent!");
        }
      } catch {
        // Silently retry on next interval
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [open, claimStatus, chainId, wallet]);

  // Function to handle the faucet claim process
  const handleClaim = async (): Promise<{ success: boolean; txid?: string; status?: string }> => {
    if (!isConnected || claimingFaucet || !walletAddress) {
      toast.error("Wallet not connected or already claiming.");
      return { success: false };
    }

    if (!wallet.publicKey) {
      toast.error("Could not obtain wallet verification. Please try sign out and sign in again.");
      return { success: false };
    }

    if (!faucetInfo.faucetEnabled) {
      toast.error("The faucet is temporarily disabled.");
      return { success: false };
    }

    if (!faucetInfo.hasSufficientFunds) {
      toast.error("The faucet is currently out of funds. Please try again later.");
      return { success: false };
    }

    const reqs = faucetInfo.requirements;
    if (!reqs.photo || !reqs.background || !reqs.bio || !reqs.minLinks) {
      toast.error("Complete your profile to unlock the faucet.");
      return { success: false };
    }

    setClaimingFaucet(true);
    try {
      const faucetRequestData: any = {
        publicKey: wallet.publicKey!,
        chainId: chainId!,
      };

      if (isForceMetamask) {
        faucetRequestData.address = wallet.address;
      } else {
        if (wallet.getIdentityToken) {
          const idToken = await wallet.getIdentityToken();
          if (!idToken) {
            toast.error("Could not get user session. Please try again.");
            return { success: false };
          }
          faucetRequestData.idToken = idToken;
        } else {
          toast.error("Authentication context not available. Please try again.");
          return { success: false };
        }
      }

      const result = await trpcClient.dailyAirdrop.claimDailyAirdrop.mutate(faucetRequestData);

      if (result.success) {
        const now = new Date();
        const nextDate = new Date(now.getTime() + DAILY_AIRDROP_COOLDOWN_MS);

        if (result.status === "instant" && result.txid) {
          setClaimStatus("instant");
          setTxInfo({ txid: result.txid });
          setShowSuccessDialog(true);
          toast.success(
            result.message || `Your ${result.amount} ${result.currency} has arrived instantly!`
          );
          wallet.updateBalanceDelayed();
        } else if (result.status === "queued") {
          setClaimStatus("queued");
          setQueueStatus({
            position: result.position!,
            totalInBatch: result.totalInBatch!,
            estimatedTime: result.estimatedTime!,
          });
          toast.success(result.message || "Added to today's batch queue!");
        }

        return {
          success: true,
          txid: result.txid,
          status: result.status,
        };
      } else {
        toast.error(result.message || "Failed to claim daily airdrop.");
        return { success: false };
      }
    } catch (error: any) {
      if (error.data?.code === "FORBIDDEN") {
        toast.error("The faucet is out of funds. Please try again later.");
        setFaucetInfo(prev => ({ ...prev, hasSufficientFunds: false }));
      } else {
        console.error("Error claiming daily airdrop:", error);
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
    claimStatus,
    queueStatus,
    isInstant,
  };
}
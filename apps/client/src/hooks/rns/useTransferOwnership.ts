import { useCallback, useMemo, useRef, useState } from "react";
import {
  BASE_REGISTRAR_ABI,
  getChainConfig,
  parseRnsInput,
  REGISTRAR_CONTROLLER_ABI,
  rnsTokenId,
} from "@repo/web3";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";

import { TxStatus, TxStep } from "@/types/rns/common";
import { useEditor } from "@/contexts/EditorContext";
import { withWalletTimeout } from "@/utils/walletTimeout";

export type StepState = {
  step: TxStep;
  status: TxStatus; // "idle" | "pending" | "success" | "error"
  hash?: `0x${string}`;
  error?: Error;
  /** The approval was already in place, so no request ran (080 D2). */
  skipped?: boolean;
};

type TransferResult = {
  success: boolean;
  steps: Record<TxStep, StepState>;
  error?: Error;
};

const initialSteps = (): Record<TxStep, StepState> => ({
  approval: { step: "approval", status: "idle" },
  transfer: { step: "transfer", status: "idle" },
});

/**
 * Transfers one RNS name (080). The approval covers this one name only
 * (approve(controller, tokenId)), never every name in the wallet, and is
 * skipped when the controller is already approved for it (D2). A declined or
 * failed request marks its own step as failed, so the flow never freezes.
 */
export function useTransferOwnership() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { profile, clearRevoName } = useEditor();

  const networkConfig = getChainConfig(chainId ?? 0);

  const [steps, setSteps] = useState<Record<TxStep, StepState>>(initialSteps);
  // The latest steps, readable inside the async flow without a stale closure
  const stepsRef = useRef<Record<TxStep, StepState>>(initialSteps());

  const updateStep = useCallback((step: TxStep, patch: Partial<StepState>) => {
    stepsRef.current = {
      ...stepsRef.current,
      [step]: { ...stepsRef.current[step], ...patch },
    };
    setSteps(stepsRef.current);
  }, []);

  const resetSteps = useCallback(() => {
    stepsRef.current = initialSteps();
    setSteps(stepsRef.current);
  }, []);

  const transferOwnership = useCallback(
    async (name: string, receiverAddress: `0x${string}`): Promise<TransferResult> => {
      if (!address) throw new Error("Wallet not connected");
      if (!networkConfig) throw new Error("Unsupported network");
      if (!publicClient) throw new Error("Public client not available");

      resetSteps();
      const label = parseRnsInput(name, chainId);
      const tokenId = rnsTokenId(label);
      const registrar = networkConfig.contracts.BASE_REGISTRAR.address;
      const controller = networkConfig.contracts.REGISTRAR_CONTROLLER.address;
      let current: TxStep = "approval";

      const waitFor = async (hash: `0x${string}`) => {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`${current} transaction reverted`);
      };

      try {
        // 1. Approval for this token only, skipped when already in place
        updateStep("approval", { status: "pending", error: undefined });
        const [approved, approvedForAll] = await Promise.all([
          publicClient
            .readContract({
              address: registrar,
              abi: BASE_REGISTRAR_ABI,
              functionName: "getApproved",
              args: [tokenId],
            })
            .catch(() => null),
          publicClient
            .readContract({
              address: registrar,
              abi: BASE_REGISTRAR_ABI,
              functionName: "isApprovedForAll",
              args: [address, controller],
            })
            .catch(() => false),
        ]);
        const inPlace =
          approvedForAll === true ||
          (typeof approved === "string" && approved.toLowerCase() === controller.toLowerCase());

        if (inPlace) {
          updateStep("approval", { status: "success", skipped: true });
        } else {
          // QA-057: bounded wallet waits, so a silent wallet ends in the error state
          const hash = await withWalletTimeout(
            writeContractAsync({
              address: registrar,
              abi: BASE_REGISTRAR_ABI,
              functionName: "approve",
              args: [controller, tokenId],
            })
          );
          updateStep("approval", { hash });
          await waitFor(hash);
          updateStep("approval", { status: "success" });
        }

        // 2. Transfer the name to the recipient
        current = "transfer";
        updateStep("transfer", { status: "pending", error: undefined });
        const hash = await withWalletTimeout(
          writeContractAsync({
            address: controller,
            abi: REGISTRAR_CONTROLLER_ABI,
            functionName: "transferRNSName",
            args: [label, receiverAddress, networkConfig.contracts.L2_RESOLVER.address],
          })
        );
        updateStep("transfer", { hash });
        await waitFor(hash);
        updateStep("transfer", { status: "success" });

        // The page no longer owns the name, so it stops showing it (080)
        if (profile.revoName && parseRnsInput(profile.revoName, chainId) === label) {
          await clearRevoName();
        }
        return { success: true, steps: stepsRef.current };
      } catch (error) {
        updateStep(current, { status: "error", error: error as Error });
        return { success: false, steps: stepsRef.current, error: error as Error };
      }
    },
    [
      address,
      chainId,
      clearRevoName,
      networkConfig,
      profile.revoName,
      publicClient,
      resetSteps,
      updateStep,
      writeContractAsync,
    ]
  );

  const overallStatus: TxStatus = useMemo(() => {
    const statuses = Object.values(steps).map(s => s.status);

    if (statuses.includes("error")) return "error";
    if (statuses.includes("pending")) return "pending";
    if (statuses.every(s => s === "success")) return "success";
    return "idle";
  }, [steps]);

  return {
    transferOwnership,
    resetSteps,
    isConnected: Boolean(address),
    steps,
    overallStatus,
  };
}

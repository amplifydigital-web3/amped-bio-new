import { useCallback, useMemo, useState } from "react";
import {
  BASE_REGISTRAR_ABI,
  getChainConfig,
  RESOLVER_ABI,
  REVERSE_REGISTRAR_ABI,
} from "@ampedbio/web3";
import { keccak256, namehash, toBytes } from "viem";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";

import { domainName } from "@/utils/rns";
import { ContractStep, TxStatus, TxStep } from "@/types/rns/common";

export type StepState = {
  step: TxStep;
  status: TxStatus; // "idle" | "pending" | "success" | "error"
  hash?: `0x${string}`;
  error?: Error;
};

type TransferResult = {
  success: boolean;
  steps: Record<TxStep, StepState>;
  error?: Error;
};

const INITIAL_STEPS: Record<TxStep, StepState> = {
  setAddr: { step: "setAddr", status: "idle" },
  setName: { step: "setName", status: "idle" },
  reclaim: { step: "reclaim", status: "idle" },
  transfer: { step: "transfer", status: "idle" },
};

export function useTransferOwnership() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const networkConfig = getChainConfig(chainId ?? 0);

  const [steps, setSteps] = useState<Record<TxStep, StepState>>(INITIAL_STEPS);

  const resetSteps = () => {
    setSteps(INITIAL_STEPS);
  };

  const updateStep = useCallback((step: TxStep, patch: Partial<StepState>) => {
    setSteps(prev => ({
      ...prev,
      [step]: { ...prev[step], ...patch },
    }));
  }, []);

  const executeStep = useCallback(
    async (config: ContractStep) => {
      if (!publicClient) {
        throw new Error("Public client not available");
      }

      updateStep(config.step, { status: "pending", error: undefined });

      const hash = await writeContractAsync({
        address: config.contractAddress,
        abi: config.abi,
        functionName: config.functionName,
        args: config.args,
      });

      updateStep(config.step, { hash });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status !== "success") {
        throw new Error(`${config.step} transaction failed`);
      }

      updateStep(config.step, { status: "success" });
    },
    [publicClient, updateStep, writeContractAsync]
  );

  const transferOwnership = useCallback(
    async (name: string, receiverAddress: `0x${string}`): Promise<TransferResult> => {
      if (!address) throw new Error("Wallet not connected");
      if (!networkConfig) throw new Error("Unsupported network");

      resetSteps();

      const node = namehash(domainName(name));
      const tokenId = BigInt(keccak256(toBytes(name)));

      const contractSteps: ContractStep[] = [
        {
          step: "setAddr",
          contractAddress: networkConfig.contracts.L2_RESOLVER.address as `0x${string}`,
          abi: RESOLVER_ABI,
          functionName: "setAddr",
          args: [node, receiverAddress],
        },
        {
          step: "setName",
          contractAddress: networkConfig.contracts.REVERSE_REGISTRAR.address as `0x${string}`,
          abi: REVERSE_REGISTRAR_ABI,
          functionName: "setName",
          args: [""],
        },
        {
          step: "reclaim",
          contractAddress: networkConfig.contracts.BASE_REGISTRAR.address as `0x${string}`,
          abi: BASE_REGISTRAR_ABI,
          functionName: "reclaim",
          args: [tokenId, receiverAddress],
        },
        {
          step: "transfer",
          contractAddress: networkConfig.contracts.BASE_REGISTRAR.address as `0x${string}`,
          abi: BASE_REGISTRAR_ABI,
          functionName: "safeTransferFrom",
          args: [address, receiverAddress, tokenId],
        },
      ];

      try {
        for (const step of contractSteps) {
          await executeStep(step);
        }

        return {
          success: true,
          steps,
        };
      } catch (error) {
        const failedStep = Object.values(steps).find(s => s.status === "pending")?.step;

        if (failedStep) {
          updateStep(failedStep, {
            status: "error",
            error: error as Error,
          });
        }

        return {
          success: false,
          steps,
          error: error as Error,
        };
      }
    },
    [address, executeStep, networkConfig, steps, updateStep]
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
    isConnected: Boolean(address),
    steps,
    overallStatus,
  };
}

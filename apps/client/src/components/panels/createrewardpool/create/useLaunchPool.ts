import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { BaseError, parseEther, zeroAddress, type Address } from "viem";
import { trpcClient } from "@repo/ui";
import { CREATOR_POOL_FACTORY_ABI, getChainConfig } from "@repo/web3";
import { classifyTxError } from "../../explore/pool-panel/format";
import { INITIAL_STAKE } from "./copy";

export type FailCause = "rejected" | "funds" | "reverted" | "other";

export type LaunchState =
  | { phase: "idle" }
  | { phase: "signing" }
  | { phase: "chain"; hash: `0x${string}` }
  // The receipt could not be read: the pool may exist, so never report failure
  | { phase: "unknown"; hash: `0x${string}` }
  | { phase: "saving"; hash: `0x${string}` }
  // 066 I08: created on chain, the Amped.Bio record did not save yet
  | { phase: "sync-failed"; hash: `0x${string}` }
  | { phase: "done"; hash: `0x${string}`; imageFailed: boolean; poolAddress?: Address }
  | { phase: "failed"; cause: FailCause; raw: string; hash?: `0x${string}` };

export interface LaunchInput {
  name: string;
  description: string;
  share: number;
  imageFileId: number | null;
}

type CreatePool = (args: {
  poolName: string;
  creatorCut: number;
  stake: number;
}) => Promise<`0x${string}`>;

function rawMessage(error: unknown) {
  if (error instanceof BaseError) return error.shortMessage;
  if (error instanceof Error) return error.message;
  return String(error);
}

// 066 I09: one plain cause per error
function causeOf(error: unknown): FailCause {
  if (classifyTxError(error) === "rejected") return "rejected";
  const text = error instanceof BaseError ? error.details + error.message : rawMessage(error);
  if (/insufficient funds/i.test(text)) return "funds";
  return "other";
}

/**
 * Screen Review 066 I06 to I08: the launch as tracked steps. Each phase
 * changes only when its real call resolves. Once the receipt succeeds the pool
 * exists and the flow never reports a failure.
 */
export function useLaunchPool({
  chainId,
  account,
  createPool,
}: {
  chainId: number;
  account?: Address;
  createPool: CreatePool;
}) {
  const publicClient = usePublicClient({ chainId });
  const [state, setState] = useState<LaunchState>({ phase: "idle" });
  const pending = useRef<{ poolId: number; input: LaunchInput } | null>(null);

  const finish = useCallback(
    async (hash: `0x${string}`) => {
      const job = pending.current;
      setState({ phase: "saving", hash });
      try {
        await trpcClient.pools.creator.syncPoolCreation.mutate({
          chainId: chainId.toString(),
          creationTxid: hash,
        });
      } catch {
        setState({ phase: "sync-failed", hash });
        return;
      }
      let imageFailed = false;
      if (job?.input.imageFileId) {
        try {
          await trpcClient.pools.creator.setImageForPool.mutate({
            id: job.poolId,
            image_file_id: job.input.imageFileId,
          });
        } catch {
          imageFailed = true;
        }
      }
      let poolAddress: Address | undefined;
      const factory = getChainConfig(chainId)?.contracts?.CREATOR_POOL_FACTORY?.address;
      if (publicClient && factory && account) {
        poolAddress = await publicClient
          .readContract({
            address: factory,
            abi: CREATOR_POOL_FACTORY_ABI,
            functionName: "getPoolForCreator",
            args: [account],
          })
          .then(value => (value && value !== zeroAddress ? (value as Address) : undefined))
          .catch(() => undefined);
      }
      setState({ phase: "done", hash, imageFailed, poolAddress });
    },
    [account, chainId, publicClient]
  );

  const watch = useCallback(
    async (hash: `0x${string}`) => {
      setState({ phase: "chain", hash });
      try {
        const receipt = await publicClient!.waitForTransactionReceipt({ hash, confirmations: 1 });
        if (receipt.status === "reverted") {
          setState({
            phase: "failed",
            cause: "reverted",
            raw: `Transaction reverted on ${getChainConfig(chainId)?.name ?? "the network"}.`,
            hash,
          });
          return;
        }
      } catch {
        setState({ phase: "unknown", hash });
        return;
      }
      await finish(hash);
    },
    [chainId, finish, publicClient]
  );

  const launch = useCallback(
    async (input: LaunchInput) => {
      setState({ phase: "signing" });
      let hash: `0x${string}`;
      try {
        const created = await trpcClient.pools.creator.create.mutate({
          description: input.description,
          chainId: chainId.toString(),
        });
        pending.current = { poolId: created.id, input };
        hash = await createPool({
          poolName: input.name,
          creatorCut: input.share,
          stake: Number(INITIAL_STAKE),
        });
      } catch (error) {
        setState({ phase: "failed", cause: causeOf(error), raw: rawMessage(error) });
        return;
      }
      await watch(hash);
    },
    [chainId, createPool, watch]
  );

  const retry = useCallback(() => {
    if (state.phase === "sync-failed") void finish(state.hash);
    if (state.phase === "unknown") void watch(state.hash);
  }, [finish, state, watch]);

  const reset = useCallback(() => {
    pending.current = null;
    setState({ phase: "idle" });
  }, []);

  return { state, launch, retry, reset };
}

export type NetworkFee =
  | { status: "calculating" }
  | { status: "ready"; fee: bigint }
  | { status: "unavailable" };

/** 066 I02: estimated gas for createPool (with the stake value) times the gas price. */
export function useCreatePoolFee({
  chainId,
  account,
  name,
  share,
  enabled,
}: {
  chainId: number;
  account?: Address;
  name: string;
  share: number;
  enabled: boolean;
}) {
  const publicClient = usePublicClient({ chainId });
  const chain = getChainConfig(chainId);
  const factory = chain?.contracts?.CREATOR_POOL_FACTORY?.address;
  const node = chain?.contracts?.NODE?.address;

  const query = useQuery({
    queryKey: ["create-pool", "network-fee", chainId, account, name, share],
    enabled: enabled && !!publicClient && !!account && !!factory && !!node,
    retry: false,
    staleTime: 15_000,
    queryFn: async () => {
      const [gas, gasPrice] = await Promise.all([
        publicClient!.estimateContractGas({
          address: factory!,
          abi: CREATOR_POOL_FACTORY_ABI,
          functionName: "createPool",
          args: [node!, BigInt(share * 100), name],
          value: parseEther(INITIAL_STAKE),
          account: account!,
        }),
        publicClient!.getGasPrice(),
      ]);
      return gas * gasPrice;
    },
  });

  const fee: NetworkFee = query.isSuccess
    ? { status: "ready", fee: query.data }
    : query.isError || !account
      ? { status: "unavailable" }
      : { status: "calculating" };
  return { fee, refetch: query.refetch };
}

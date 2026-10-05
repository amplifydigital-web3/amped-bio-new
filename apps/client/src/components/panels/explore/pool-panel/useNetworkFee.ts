import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { type Abi, type Address } from "viem";

export interface FeeRequest {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export type NetworkFee =
  | { status: "calculating" }
  | { status: "ready"; fee: bigint }
  | { status: "unavailable" };

// Estimated network fee for a contract call: estimated gas times the current
// gas price (Screen Review 048 I10). Never a fixed number; when the estimate
// fails the row reads "Shown in your wallet".
export function useNetworkFee({
  chainId,
  account,
  request,
  enabled,
}: {
  chainId?: number;
  account?: Address;
  request: FeeRequest | null;
  enabled: boolean;
}): NetworkFee {
  const publicClient = usePublicClient({ chainId });

  const query = useQuery({
    queryKey: [
      "pool-panel",
      "network-fee",
      chainId,
      account,
      request?.address,
      request?.functionName,
      // bigint args do not serialize in a query key
      request?.args?.map(arg => (typeof arg === "bigint" ? arg.toString() : arg)),
    ],
    enabled: enabled && !!publicClient && !!account && !!request,
    retry: false,
    staleTime: 15_000,
    queryFn: async () => {
      const [gas, gasPrice] = await Promise.all([
        publicClient!.estimateContractGas({
          address: request!.address,
          abi: request!.abi,
          functionName: request!.functionName,
          args: request!.args,
          account: account!,
        } as Parameters<NonNullable<typeof publicClient>["estimateContractGas"]>[0]),
        publicClient!.getGasPrice(),
      ]);
      return gas * gasPrice;
    },
  });

  if (query.isSuccess) return { status: "ready", fee: query.data };
  if (query.isError || !account || !request) return { status: "unavailable" };
  return { status: "calculating" };
}

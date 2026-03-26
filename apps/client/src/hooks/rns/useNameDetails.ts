import { useReadContract, useAccount, useReadContracts } from "wagmi";
import { keccak256, namehash, toBytes } from "viem";
import { domainName, formatDateTime } from "@/utils/rns";
import { useEffect, useMemo, useState, useCallback } from "react";
import { RegistrationData } from "@/types/rns/registration";
import { useSubgraphClient } from "@/services/subgraph/subgraphClient";
import {
  fetchRegistrationData,
  fetchOwnershipDetails,
  fetchDateDetails,
} from "@/services/subgraph/queries";
import { getChainConfig, REGISTRAR_CONTROLLER_ABI, RESOLVER_ABI } from "@ampedbio/web3";

export function useNameDetails(name: string) {
  const { address: connectedWallet, chainId } = useAccount();
  const networkConfig = getChainConfig(chainId ?? 0);
  const subgraphClient = useSubgraphClient();

  const [names, setNames] = useState<RegistrationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Scoped loading states for granular UI feedback
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [datesLoading, setDatesLoading] = useState(false);

  useEffect(() => {
    const getNameDetails = async () => {
      setIsLoading(true);
      try {
        const labelHash = keccak256(toBytes(name));
        const response = await fetchRegistrationData(labelHash, subgraphClient);
        setNames(response.data);
        setError(response.error);
      } catch {
        setError("Error While Fetching Registration Data");
      } finally {
        setIsLoading(false);
      }
    };

    getNameDetails();
  }, [name, refreshKey, subgraphClient]);

  const nameOwnerAddress = names?.revoNames?.[0]?.owner;

  const {
    data: isAvailable,
    isLoading: isAvailableLoading,
    isFetched,
    refetch: refetchAvailability,
  } = useReadContract({
    address: networkConfig?.contracts.REGISTRAR_CONTROLLER.address,
    abi: REGISTRAR_CONTROLLER_ABI,
    functionName: "available",
    args: [name],
    query: {
      enabled: Boolean(name && networkConfig?.contracts.REGISTRAR_CONTROLLER.address),
      staleTime: 30_000, // 30s — re-validate availability regularly so expired names aren't stale
      gcTime: 5 * 60_000, // 5 min
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  const tokenId = useMemo(() => {
    return BigInt(keccak256(toBytes(name)));
  }, [name]);

  // Batch-resolve all text records declared by the resolver in the subgraph
  const resolverAddress = names?.revoNames[0]?.resolver?.address;
  const textKeys = names?.revoNames[0]?.resolver?.texts ?? [];
  const nodeHash = useMemo(() => namehash(domainName(name)), [name]);

  const {
    data: textResults,
    isLoading: textRecordsLoading,
    refetch: refetchTextRecords,
  } = useReadContracts({
    contracts: textKeys.map(key => ({
      address: resolverAddress as `0x${string}`,
      abi: RESOLVER_ABI,
      functionName: "text" as const,
      args: [nodeHash, key] as [`0x${string}`, string],
    })),
    query: {
      enabled: Boolean(resolverAddress && textKeys.length > 0),
    },
  });

  const textRecords = useMemo(() => {
    if (!textResults) return {} as Record<string, string>;
    return textKeys.reduce<Record<string, string>>((acc, key, i) => {
      const result = textResults[i];
      if (result?.status === "success" && typeof result.result === "string") {
        acc[key] = result.result;
      }
      return acc;
    }, {});
  }, [textKeys, textResults]);

  // Internal fetch function - ownership only (optimized)
  const fetchOwnershipData = useCallback(async () => {
    try {
      const labelHash = keccak256(toBytes(name));
      const response = await fetchOwnershipDetails(labelHash, subgraphClient);

      if (response.data?.revoNames) {
        // Merge ownership data with existing names
        setNames(prev => {
          if (!prev?.revoNames || !response.data?.revoNames) return prev;

          const mergedRevoName = {
            ...prev.revoNames[0],
            ...response.data.revoNames[0],
            name: prev.revoNames[0].name,
          };

          return {
            ...prev,
            revoNames: [mergedRevoName],
          } as unknown as RegistrationData;
        });
      }
      setError(response.error);
    } catch {
      setError("Error While Fetching Ownership Data");
    }
  }, [name, subgraphClient]);

  // Internal fetch function - dates only (optimized)
  const fetchDatesData = useCallback(async () => {
    try {
      const labelHash = keccak256(toBytes(name));
      const response = await fetchDateDetails(labelHash, subgraphClient);

      if (response.data && (response.data.revoNames || response.data.registration)) {
        // Merge dates data with existing names
        setNames(prev => {
          if (!prev) return prev;

          const updatedRevoNames =
            prev.revoNames && response.data?.revoNames
              ? [{ ...prev.revoNames[0], ...response.data.revoNames[0] }]
              : prev.revoNames;

          return {
            ...prev,
            revoNames: updatedRevoNames,
            registration: response.data?.registration ?? prev.registration,
          } as unknown as RegistrationData;
        });
      }
      setError(response.error);
    } catch {
      setError("Error While Fetching Date Data");
    }
  }, [name, subgraphClient]);

  // Full refetch - updates all data
  const refetchNameDetails = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Scoped refresh for ownership data (after transfer)
  const refetchOwnership = useCallback(async () => {
    setOwnershipLoading(true);
    try {
      await fetchOwnershipData();
    } finally {
      setOwnershipLoading(false);
    }
  }, [fetchOwnershipData]);

  // Scoped refresh for dates data (after renewal/extend)
  const refetchDates = useCallback(async () => {
    setDatesLoading(true);
    try {
      await fetchDatesData();
    } finally {
      setDatesLoading(false);
    }
  }, [fetchDatesData]);

  // Optimistic update: immediately set the new owner after a confirmed transfer
  const optimisticSetOwner = useCallback((newOwner: `0x${string}`) => {
    setNames(prev => {
      if (!prev?.revoNames?.[0]) return prev;
      return {
        ...prev,
        revoNames: [{ ...prev.revoNames[0], owner: newOwner }],
      } as unknown as RegistrationData;
    });
  }, []);

  // Optimistic update: immediately set the new expiry after a confirmed extension
  const optimisticExtendExpiry = useCallback((addedDurationSeconds: bigint) => {
    setNames(prev => {
      if (!prev) return prev;

      const currentExpiry = BigInt(prev.registration?.expiryDate ?? 0);
      const newExpiry = currentExpiry + addedDurationSeconds;

      const currentGrace = BigInt(prev.revoNames?.[0]?.expiryDateWithGrace ?? 0);
      const newGrace = currentGrace + addedDurationSeconds;

      return {
        ...prev,
        registration: {
          ...prev.registration,
          expiryDate: String(newExpiry),
        },
        revoNames: prev.revoNames
          ? [{ ...prev.revoNames[0], expiryDateWithGrace: String(newGrace) }]
          : prev.revoNames,
      } as unknown as RegistrationData;
    });
  }, []);

  return {
    name,
    ownerAddress: nameOwnerAddress as `0x${string}`,
    displayAddress: nameOwnerAddress
      ? `${nameOwnerAddress.slice(0, 6)}...${nameOwnerAddress.slice(-4)}`
      : "",
    contractAddress: networkConfig?.contracts?.REGISTRAR_CONTROLLER.address ?? "",
    isCurrentOwner: connectedWallet?.toLowerCase() === nameOwnerAddress?.toLowerCase(),
    nftId: tokenId,
    resolver: names?.revoNames?.[0]?.resolver?.address,
    transactionHash: names?.nameRegistereds?.[0]?.transactionID as `0x${string}`,
    dates: {
      expiry: formatDateTime(Number(names?.registration?.expiryDate)),
      gracePeriod: formatDateTime(Number(names?.revoNames?.[0]?.expiryDateWithGrace)),
      registration: formatDateTime(Number(names?.registration?.registrationDate)),
    },
    error,

    // 🔁 Refresh controls
    refetchNameDetails, // Full refresh
    refetchOwnership, // Scoped: ownership data (after transfer)
    refetchDates, // Scoped: dates data (after renewal)
    refetchAvailability,

    // ✅ Optimistic updates (instant UI after confirmed tx)
    optimisticSetOwner,
    optimisticExtendExpiry,

    // Text records resolved from resolver.texts keys
    textRecords,
    refetchTextRecords,

    // Loading states
    isLoading, // Full page loading — only tracks initial registration data fetch, NOT background availability refetches
    ownershipLoading, // Ownership section only
    datesLoading, // Dates section only
    textRecordsLoading,

    // raw availability (optional exposure)
    isNameAvailable: isFetched ? isAvailable : undefined,
  };
}

import { useAccount } from "wagmi";

import { keccak256, toBytes } from "viem";
import { DateTime } from "luxon";
import { useEffect, useState } from "react";

import { NameDetail } from "@/types/rns/name";
import { useSubgraphClient } from "@/services/subgraph/subgraphClient";
import { fetchGetNameDetails } from "@/services/subgraph/queries";

const GRACE_PERIOD_HOUR = 1;

const formatAddress = (address: string | undefined): string => {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatDateTime = (timestamp: bigint | undefined) => {
  if (!timestamp) {
    return {
      date: "",
      time: "",
      graceDate: "",
      graceTime: "",
      isExpired: false,
    };
  }

  const expiryDate = DateTime.fromSeconds(Number(timestamp));
  const graceEndDate = expiryDate.plus({ hour: GRACE_PERIOD_HOUR });
  const now = DateTime.now();

  return {
    date: expiryDate.toFormat("MMMM dd, yyyy"),
    time: expiryDate.toFormat("HH:mm:ss ZZZZ"),
    graceDate: graceEndDate.toFormat("MMMM dd, yyyy"),
    graceTime: graceEndDate.toFormat("HH:mm:ss ZZZZ"),
    isExpired: now > expiryDate,
  };
};

export function useOwnerDetail(name: string) {
  const { address: currentWalletAddress } = useAccount();
  const subgraphClient = useSubgraphClient();

  const [names, setNames] = useState<NameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const tokenId = (() => {
    const bytes32 = toBytes(name);
    const hash = keccak256(bytes32);
    return BigInt(hash);
  })();

  useEffect(() => {
    const getData = async () => {
      setIsLoading(true);

      try {
        const response = await fetchGetNameDetails(name, subgraphClient);

        if (response.data?.length) {
          setNames(response.data[0]);
        } else {
          setNames(null);
        }

        setError(response.error ?? null);
      } catch (err) {
        setNames(null);
        setError("Error while fetching name details");
      } finally {
        setIsLoading(false);
      }
    };

    getData();
  }, [name, refreshKey, subgraphClient]);

  const expiryTimestamp = names?.registration?.expiryDate
    ? BigInt(names.registration.expiryDate)
    : undefined;

  const { date, time, graceDate, graceTime, isExpired } = formatDateTime(expiryTimestamp);

  const refetch = () => {
    setRefreshKey(prev => prev + 1);
  };

  return {
    expiryDate: {
      timestamp: expiryTimestamp,
      date,
      time,
      graceDate,
      graceTime,
      isExpired,
    },
    nftId: tokenId,
    ownerAddress: {
      full: names?.owner as `0x${string}`,
      formatted: formatAddress(names?.owner),
    },
    resolver: names?.resolver.address,
    isCurrentOwner: currentWalletAddress?.toLowerCase() === names?.owner?.toLowerCase(),
    error,
    refetch,
    isLoading,
  };
}

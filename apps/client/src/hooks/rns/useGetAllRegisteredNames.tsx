import {
  fetchActiveRegisteredNamesOfOwner,
  fetchAllRegisteredNamesOfOwner,
} from "@/services/subgraph/queries";
import { useSubgraphClient } from "@/services/subgraph/subgraphClient";
import { RevoName } from "@/types/rns/name";
import { useCallback, useEffect, useState } from "react";
import { Address } from "viem";

export default function useGetAllRegisteredNames(
  address: Address | undefined,
  isConnected: boolean,
  activeOnly: boolean = false
) {
  const subgraphClient = useSubgraphClient();

  const [revoNames, setRevoNames] = useState<RevoName[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [isFetching, setIsFetching] = useState<boolean>(Boolean(address) && isConnected);

  const fetchData = useCallback(async () => {
    if (!address || !isConnected) {
      setIsFetching(false);
      return;
    }

    setIsFetching(true);
    setError(null);
    try {
      const response = activeOnly
        ? await fetchActiveRegisteredNamesOfOwner(address, subgraphClient)
        : await fetchAllRegisteredNamesOfOwner(address, subgraphClient);
      setRevoNames(response.data ?? []);
      setError(response.error);
    } catch (e) {
      console.error("Error fetching data:", e);
      setError("Something went wrong while fetching names.");
    } finally {
      setIsFetching(false);
    }
  }, [address, subgraphClient, isConnected, activeOnly]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    isFetching,
    revoNames,
    error,
    refetch: fetchData,
  };
}

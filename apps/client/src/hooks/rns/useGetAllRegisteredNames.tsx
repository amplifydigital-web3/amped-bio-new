import { fetchAllRegisteredNamesOfOwner } from "@/services/subgraph/queries";
import { useSubgraphClient } from "@/services/subgraph/subgraphClient";
import { RevoName } from "@/types/rns/name";
import { useCallback, useEffect, useState } from "react";
import { Address } from "viem";

export default function useGetAllRegisteredNames(
  address: Address | undefined,
  isConnected: boolean
) {
  const [isFetching, setIsFetching] = useState(false);
  const [revoNames, setRevoNames] = useState<RevoName[]>([]);
  const [error, setError] = useState<string | null>(null);

  const subgraphClient = useSubgraphClient();

  const fetchData = useCallback(async () => {
    if (!address || !subgraphClient || !isConnected) return;

    setIsFetching(true);
    try {
      const response = await fetchAllRegisteredNamesOfOwner(address, subgraphClient);
      setRevoNames(response.data ?? []);
      setError(response.error);
    } catch (e) {
      console.error("Error fetching data:", e);
      setError("Something went wrong while fetching names.");
    } finally {
      setIsFetching(false);
    }
  }, [address, subgraphClient, isConnected]);

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

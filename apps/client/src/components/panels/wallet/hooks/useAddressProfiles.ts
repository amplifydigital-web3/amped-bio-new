import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { Address } from "viem";

export type AddressProfile = {
  name: string | null;
  handle: string | null;
  image: string | null;
};

export type AddressProfilesMap = Record<string, AddressProfile | null>;

export function useAddressProfiles(addresses: Address[]): {
  profiles: AddressProfilesMap;
  isLoading: boolean;
} {
  const uniqueAddresses = useMemo(() => {
    const set = new Set(addresses.map(a => a.toLowerCase()).filter(Boolean));
    return Array.from(set);
  }, [addresses]);

  const enabled = uniqueAddresses.length > 0;

  const { data, isLoading } = useQuery({
    ...trpc.wallet.getUsersByAddresses.queryOptions({
      addresses: uniqueAddresses,
    }),
    enabled,
    staleTime: 60_000,
  });

  const profiles: AddressProfilesMap = useMemo(() => data ?? {}, [data]);

  return { profiles, isLoading };
}

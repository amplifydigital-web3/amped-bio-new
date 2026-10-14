import { useQuery } from "@tanstack/react-query";
import { trpcClient, type RouterOutputs } from "@repo/ui";

export type MyPageIdentity = RouterOutputs["rns"]["getMyPageIdentity"];
export type MyRnsNames = RouterOutputs["rns"]["listMyNames"];
export type RnsDisplay = MyPageIdentity["display"];

export const MY_PAGE_IDENTITY_KEY = ["rns", "myPageIdentity"] as const;
export const MY_RNS_NAMES_KEY = ["rns", "myNames"] as const;

const showRns = import.meta.env.VITE_SHOW_RNS === "true";

/**
 * Screen Review 108 I07, I08, I11: the owner's RNS name, its state now, the
 * identity check and the public identity exactly as getHandle builds it. The
 * Page RNS section and the editor preview chip read this one query.
 */
export function useMyPageIdentity(enabled = true) {
  return useQuery({
    queryKey: MY_PAGE_IDENTITY_KEY,
    queryFn: () => trpcClient.rns.getMyPageIdentity.query(),
    enabled: showRns && enabled,
    staleTime: 30_000,
  });
}

/** 108 I03: the account wallet's names, checked on the server */
export function useMyRnsNames(enabled = true) {
  return useQuery({
    queryKey: MY_RNS_NAMES_KEY,
    queryFn: () => trpcClient.rns.listMyNames.query(),
    enabled: showRns && enabled,
    staleTime: 60_000,
  });
}

import { useQuery } from "@tanstack/react-query";
import { trpcClient, type RouterOutputs } from "@repo/ui";
import { RNSID_ATTRIBUTE_SWITCH, type RnsIdBlockConfig } from "@repo/constants";

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

/**
 * The page identity with the shared attributes picked by the live RNS ID block
 * switches. The server picks them by the saved switches, so without this a
 * toggle shows only after autosave and a refetch. `show` is null when the page
 * has no visible RNS ID block, which shows no attributes (as on the server).
 */
export function withLiveAttributes(
  data: MyPageIdentity | undefined,
  show: RnsIdBlockConfig["show"] | null
) {
  if (!data?.identity) return null;
  const shared = data.verification.state === "verified" ? data.verification.attributes : undefined;
  const attributes = Object.fromEntries(
    data.sharedAttributes.flatMap(key =>
      show?.[RNSID_ATTRIBUTE_SWITCH[key]] && shared?.[key] ? [[key, shared[key]]] : []
    )
  );
  return { ...data.identity, attributes };
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

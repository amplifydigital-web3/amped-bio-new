import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChainId } from "wagmi";
import { trpcClient } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { isForceMetamask } from "@/utils/auth";

export type FaucetRequirements = {
  photo: boolean;
  background: boolean;
  bio: boolean;
  minLinks: boolean;
};

// 053 I09: a request is Processing for 6 hours, then the cooldown runs to 24 hours
const PROCESSING_MS = 6 * 60 * 60 * 1000;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

// 053 server gate errors, approved wording 18 (one line per missing step)
const GATE_ERRORS: { match: RegExp; text: string }[] = [
  { match: /photo/i, text: "Add a profile photo to use the faucet." },
  { match: /background/i, text: "Add a background to use the faucet." },
  { match: /bio/i, text: "Add a bio to use the faucet." },
  { match: /links|blocks/i, text: "Add 5 or more blocks to use the faucet." },
];

type AirdropInput = Parameters<typeof trpcClient.wallet.requestAirdrop.mutate>[0];

export type FaucetState =
  | "loading"
  | "error"
  | "paused"
  | "empty"
  | "setup"
  | "ready"
  | "sending"
  | "sent"
  | "cooldown";

/**
 * Screen Review 053 I02. Faucet status is fetched when the Wallet mounts (not
 * only when Fund opens) and cached under one query key, so the Fund row meta
 * can read the same data. The request itself runs here, with inline errors
 * instead of toasts (I10).
 */
export function useFaucet() {
  const wallet = useWalletContext();
  const chainId = useChainId();
  const queryClient = useQueryClient();
  const queryKey = ["wallet", "faucet", chainId];

  const status = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await trpcClient.wallet.getFaucetAmount.query({ chainId });
      return {
        ...result,
        lastRequestDate: result.lastRequestDate ? new Date(result.lastRequestDate) : null,
        nextAvailableDate: result.nextAvailableDate ? new Date(result.nextAvailableDate) : null,
        requirements: (result.requirements ?? {
          photo: false,
          background: false,
          bio: false,
          minLinks: false,
        }) as FaucetRequirements,
      };
    },
    enabled: !!chainId,
    staleTime: 60_000,
    retry: 1,
  });

  const [sending, setSending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const data = status.data;
  const requirements = data?.requirements;
  const doneCount = requirements ? Object.values(requirements).filter(Boolean).length : 0;
  const allDone = doneCount === 4;

  let state: FaucetState;
  if (status.isLoading) state = "loading";
  else if (status.isError || !data) state = "error";
  else if (sending) state = "sending";
  // QA-042: a paused faucet comes back with amount 0 and every step unchecked
  else if (!data.faucetEnabled || !data.amount) state = "paused";
  else if (!data.canRequestNow && data.lastRequestDate) {
    const since = Date.now() - data.lastRequestDate.getTime();
    state = since < PROCESSING_MS ? "sent" : "cooldown";
  } else if (!data.hasSufficientFunds) state = "empty";
  else if (!allDone) state = "setup";
  else state = "ready";

  const nextAvailable =
    data?.nextAvailableDate ??
    (data?.lastRequestDate ? new Date(data.lastRequestDate.getTime() + COOLDOWN_MS) : null);

  const request = useCallback(async (): Promise<boolean> => {
    setRequestError(null);
    if (!wallet.publicKey) {
      setRequestError("Sign out and sign in again to verify your wallet.");
      return false;
    }
    setSending(true);
    try {
      const input: AirdropInput = { publicKey: wallet.publicKey, chainId };
      if (isForceMetamask) {
        input.address = wallet.address ?? undefined;
      } else {
        const idToken = wallet.getIdentityToken ? await wallet.getIdentityToken() : null;
        if (!idToken) {
          setRequestError("Your session expired. Sign in again.");
          return false;
        }
        input.idToken = idToken;
      }

      const result = await trpcClient.wallet.requestAirdrop.mutate(input);
      if (!result.success) {
        setRequestError("The request did not go through. Try again.");
        return false;
      }
      const now = new Date();
      queryClient.setQueryData(queryKey, (previous: typeof data) =>
        previous
          ? {
              ...previous,
              lastRequestDate: now,
              nextAvailableDate: new Date(now.getTime() + COOLDOWN_MS),
              canRequestNow: false,
              hasWallet: true,
            }
          : previous
      );
      wallet.updateBalanceDelayed();
      return true;
    } catch (error) {
      const err = error as { data?: { code?: string }; message?: string };
      const code = err.data?.code;
      if (code === "FORBIDDEN" && /funds/i.test(err.message ?? "")) {
        queryClient.setQueryData(queryKey, (previous: typeof data) =>
          previous ? { ...previous, hasSufficientFunds: false } : previous
        );
      } else if (code === "PRECONDITION_FAILED") {
        const gate = GATE_ERRORS.find(item => item.match.test(err.message ?? ""));
        setRequestError(gate?.text ?? "Finish the steps above to use the faucet.");
        void status.refetch();
      } else if (code === "UNAUTHORIZED") {
        setRequestError("Your session expired. Sign in again.");
      } else {
        setRequestError("The request did not go through. Try again.");
      }
      return false;
    } finally {
      setSending(false);
    }
    // queryKey is derived from chainId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, chainId, queryClient, status]);

  const { refetch } = status;
  const retry = useCallback(() => void refetch(), [refetch]);

  return {
    state,
    amount: data?.amount ?? null,
    currency: data?.currency ?? "tREVO",
    requirements,
    doneCount,
    nextAvailable,
    requestError,
    request,
    retry,
  };
}

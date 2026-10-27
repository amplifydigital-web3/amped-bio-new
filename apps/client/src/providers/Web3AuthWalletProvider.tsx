import { useCallback, useEffect, ReactNode, useRef, useState, useMemo } from "react";
import { useBalance } from "wagmi";
import { TRPCClientError } from "@trpc/client";
import { queryClient, useAuth } from "@repo/ui";
import { WalletContext } from "../contexts/WalletContext";
import { useWeb3AuthWallet } from "../hooks/useWallet";
import { trpcClient } from "@repo/ui";
import { type Address } from "viem";
import {
  WALLET_TOKEN_EXPIRATION_KEY,
  clearWalletBrowserState,
  isWalletMismatch,
  sameAddress,
} from "../utils/walletSession";

const THROTTLE_DURATION = 3_000; // 3 seconds in milliseconds
const TOKEN_REFRESH_CHECK_INTERVAL = 30_000; // Check every 30 seconds if token needs refresh
const TOKEN_EXPIRATION_BUFFER = 60_000; // Refresh if token expires in less than 1 minute
const RESET_RECONNECT_WINDOW = 15_000; // After a wallet reset, retry the auto connect for this long

export const Web3AuthWalletProvider = ({ children }: { children: ReactNode }) => {
  const { authUser, updateAuthUser, signOut } = useAuth();
  const wallet = useWeb3AuthWallet();
  const {
    status: walletStatus,
    address: walletAddress,
    connect: walletConnect,
    disconnect: walletDisconnect,
    getIdentityToken: walletGetIdentityToken,
    provider: walletProvider,
    error: walletError,
  } = wallet;

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isUSD, setIsUSD] = useState(false);
  const [tokenExpiration, setTokenExpiration] = useState<number | null>(() => {
    const storedExpiration = localStorage.getItem(WALLET_TOKEN_EXPIRATION_KEY);
    return storedExpiration ? parseInt(storedExpiration, 10) : null;
  });

  const lastConnectAttemptRef = useRef(0);
  const linkAddressRunningRef = useRef(false);
  const refreshTokenRunningRef = useRef(false);
  // The Amped.Bio user the current wallet session was opened for. A session
  // the SDK restored on its own (rehydration) has no owner until proven.
  const sessionOwnerRef = useRef<number | null>(null);
  // The user a connect is opening a session for right now. The SDK skips the
  // connect when a session already exists, so a session that appears while
  // this is set was opened by that connect.
  const connectingForRef = useRef<{ id: number; userId: number } | null>(null);
  const connectSeqRef = useRef(0);
  // The account the provider last saw, to detect a sign out or a switch
  const lastUserIdRef = useRef<number | null>(null);
  // One forced reconnect per (account, wrong wallet) pair, so a wallet that
  // keeps coming back wrong shows the reconnect card instead of looping
  const mismatchHandledRef = useRef<string | null>(null);
  const previousWalletAddressRef = useRef<Address | undefined>(undefined);
  const resettingRef = useRef(false);
  // Blocks auto connect while signing out, so the old account's wallet token
  // cannot reopen a session in the window before the auth session ends
  const signingOutRef = useRef(false);
  // Bumped after every reset so the auto connect effect runs again
  const [resetNonce, setResetNonce] = useState(0);
  const lastResetAtRef = useRef(0);

  /**
   * Must have 1: a real wallet sign out. Logs the SDK out whatever state it
   * reports, which ends the wallet session it would otherwise restore, and
   * forgets who the session belonged to. Safe to call when nothing is
   * connected. No `cleanup`: Web3Auth then drops its auth instance and cannot
   * connect again until the page reloads.
   */
  const resetWalletSession = useCallback(
    async (reason: string) => {
      if (resettingRef.current) return;
      resettingRef.current = true;
      console.info(`[wallet-session] resetting wallet session: ${reason}`);
      try {
        await walletDisconnect();
      } catch (error) {
        console.warn("[wallet-session] wallet disconnect failed; clearing state anyway", error);
      } finally {
        sessionOwnerRef.current = null;
        connectingForRef.current = null;
        mismatchHandledRef.current = null;
        try {
          localStorage.removeItem(WALLET_TOKEN_EXPIRATION_KEY);
        } catch {
          // storage can throw in private windows
        }
        setTokenExpiration(null);
        resettingRef.current = false;
        lastResetAtRef.current = Date.now();
        setResetNonce(value => value + 1);
      }
    },
    [walletDisconnect]
  );

  /**
   * Every connect goes through here so the session gets an owner only when
   * this call opened it with the user's wallet token. Each call has an id, so
   * an overlapping call that the SDK skips never clears another's marker.
   */
  const connectForUser = useCallback(
    async (userId: number): Promise<boolean> => {
      const id = ++connectSeqRef.current;
      connectingForRef.current = { id, userId };
      try {
        const opened = await walletConnect();
        if (opened) sessionOwnerRef.current = userId;
        return opened;
      } finally {
        if (connectingForRef.current?.id === id) connectingForRef.current = null;
      }
    },
    [walletConnect]
  );

  useEffect(() => {
    const updateTokenExpirationFromStorage = () => {
      const storedExpiration = localStorage.getItem(WALLET_TOKEN_EXPIRATION_KEY);
      if (storedExpiration) {
        setTokenExpiration(parseInt(storedExpiration, 10));
      }
    };

    updateTokenExpirationFromStorage();

    const handleStorageChange = () => {
      updateTokenExpirationFromStorage();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    if (walletError) {
      console.error("Wallet connection error:", walletError);
    }
  }, [walletError]);

  useEffect(() => {
    if (authUser && walletStatus !== "connected" && walletStatus !== "connecting") {
      if (signingOutRef.current) return;
      const now = Date.now();
      const wait = THROTTLE_DURATION - (now - lastConnectAttemptRef.current);
      if (wait > 0 || resettingRef.current) {
        // A reset can finish inside the throttle window; try again once it
        // passes. Only right after a reset, so a failing connect never polls.
        if (now - lastResetAtRef.current > RESET_RECONNECT_WINDOW) return;
        const timer = setTimeout(() => setResetNonce(value => value + 1), Math.max(wait, 250));
        return () => clearTimeout(timer);
      }
      lastConnectAttemptRef.current = now;
      // The session is this user's only when this connect opened it with
      // their wallet token. A session the SDK restored has no owner.
      void connectForUser(authUser.id);
    }
    // resetNonce: run again once a reset finishes, even if the status did not change
  }, [authUser, walletStatus, connectForUser, resetNonce]);

  // Must have 1: sign out or account switch. The previous check only ran
  // when the wallet reported "connected" at that instant, so a session that
  // was still connecting, or a switch straight from one account to another,
  // left the old wallet in place for the next account.
  useEffect(() => {
    const userId = authUser?.id ?? null;
    const previous = lastUserIdRef.current;
    lastUserIdRef.current = userId;
    if (previous === null || previous === userId) return;
    void resetWalletSession(userId === null ? "user signed out" : "account switched");
  }, [authUser?.id, resetWalletSession]);

  useEffect(() => {
    if (
      !authUser &&
      (walletStatus === "connected" ||
        walletStatus === "connecting" ||
        walletStatus === "reconnecting")
    ) {
      void resetWalletSession("no signed in user");
    }
  }, [authUser, walletStatus, resetWalletSession]);

  const walletMismatch = isWalletMismatch(authUser?.wallet, walletAddress);

  // Should have 4: address check on login. When the live wallet is not the
  // account's linked wallet, end that wallet session once; the auto connect
  // above then opens a fresh session with this account's wallet token.
  useEffect(() => {
    if (!authUser || !walletMismatch || !walletAddress) return;
    const key = `${authUser.id}:${walletAddress.toLowerCase()}`;
    console.warn("[wallet-session] live wallet does not match this account", {
      account: authUser.wallet,
      live: walletAddress,
    });
    if (mismatchHandledRef.current === key) return;
    mismatchHandledRef.current = key;
    void resetWalletSession("wallet does not match account").then(() => {
      mismatchHandledRef.current = key;
    });
  }, [authUser, walletMismatch, walletAddress, resetWalletSession]);

  // Should have 5: the wallet account changed mid session. Cached balances
  // and reads belong to the previous address, so drop them; the mismatch
  // check above decides whether the new address is allowed.
  useEffect(() => {
    const previous = previousWalletAddressRef.current;
    previousWalletAddressRef.current = walletAddress;
    if (!previous || !walletAddress || sameAddress(previous, walletAddress)) return;
    console.warn("[wallet-session] wallet account changed", { from: previous, to: walletAddress });
    void queryClient.invalidateQueries();
  }, [walletAddress]);

  useEffect(() => {
    const getAndSetPublicKey = async () => {
      if (walletProvider) {
        try {
          // @ts-ignore
          const pubKey = await walletProvider.request({ method: "public_key" });
          setPublicKey(pubKey as string);
        } catch (error) {
          console.error("Error getting public key:", error);
          setPublicKey(null);
        }
      } else {
        setPublicKey(null);
      }
    };

    getAndSetPublicKey();
  }, [walletProvider, setPublicKey]);

  useEffect(() => {
    const linkAddress = async () => {
      // Prevent parallel execution of linkAddress
      if (linkAddressRunningRef.current) {
        return;
      }
      linkAddressRunningRef.current = true;

      try {
        // Link wallet if user is authenticated, wallet is connected, and user doesn't have a wallet linked yet
        if (
          authUser &&
          walletStatus === "connected" &&
          walletAddress &&
          !authUser.wallet &&
          publicKey
        ) {
          // Never link a session this provider did not open for this user: a
          // restored session can belong to the account that signed out before.
          const owner = sessionOwnerRef.current ?? connectingForRef.current?.userId ?? null;
          if (owner !== authUser.id) {
            await resetWalletSession("restored session before first wallet link");
            return;
          }
          try {
            // @ts-ignore
            const idToken = await walletGetIdentityToken();

            await trpcClient.wallet.linkWalletAddress.mutate({
              publicKey: publicKey as string,
              idToken: idToken,
            });
            console.info("Wallet address linked successfully");
            updateAuthUser({ wallet: walletAddress });
          } catch (err) {
            if (err instanceof TRPCClientError && err.data?.code === "CONFLICT") {
              console.info("Wallet already linked.");
            } else {
              console.error("Error linking wallet address:", err);
            }
          }
        }
      } finally {
        // Reset the flag when the function completes (whether successfully or with error)
        linkAddressRunningRef.current = false;
      }
    };
    linkAddress();
  }, [
    authUser,
    walletStatus,
    walletAddress,
    walletGetIdentityToken,
    publicKey,
    updateAuthUser,
    resetWalletSession,
  ]);

  useEffect(() => {
    const refreshTokenIfNeeded = async () => {
      if (!authUser || walletStatus !== "connected" || refreshTokenRunningRef.current) {
        return;
      }

      const now = Date.now();

      if (!tokenExpiration) {
        return;
      }

      const timeUntilExpiration = tokenExpiration - now;

      if (timeUntilExpiration <= TOKEN_EXPIRATION_BUFFER) {
        console.log("Token expiring soon, refreshing...");

        refreshTokenRunningRef.current = true;

        try {
          await walletDisconnect();
          await connectForUser(authUser.id);
          console.info("Token refreshed successfully");
        } catch (error) {
          console.error("Error refreshing token:", error);
        } finally {
          refreshTokenRunningRef.current = false;
        }
      }
    };

    const interval = setInterval(refreshTokenIfNeeded, TOKEN_REFRESH_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [authUser, walletStatus, connectForUser, walletDisconnect, tokenExpiration]);

  const address = useMemo(() => {
    // Signed out: no address, so nothing of the previous account stays on screen
    if (!authUser) return undefined;
    return (authUser.wallet ?? walletAddress) as Address | undefined;
  }, [authUser, walletAddress]);

  const balance = useBalance({
    address: address,
    query: { refetchInterval: 10000 },
  });

  /** Wallet first, then Amped.Bio, then every cached query of the account. */
  const signOutEverywhere = useCallback(async () => {
    signingOutRef.current = true;
    try {
      await resetWalletSession("sign out");
      await signOut();
    } catch (error) {
      signingOutRef.current = false;
      throw error;
    }
    // The page leaves for the sign in or landing page next; nothing reconnects
    clearWalletBrowserState();
    queryClient.clear();
  }, [resetWalletSession, signOut]);

  const updateBalanceDelayed = () => {
    setTimeout(() => balance?.refetch(), 2000);
  };

  return (
    <WalletContext.Provider
      value={{
        connecting: walletStatus === "connecting",
        connect: async () => {
          if (authUser) await connectForUser(authUser.id);
        },
        disconnect: walletDisconnect,
        balance,
        isUSD,
        setIsUSD,
        updateBalanceDelayed,
        publicKey,
        address: address,
        getIdentityToken: walletGetIdentityToken,
        isWeb3Wallet: walletAddress !== undefined && !walletMismatch,
        liveAddress: walletAddress,
        walletMismatch,
        signOutEverywhere,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

import { useState, useCallback, useRef, useEffect } from "react";
import { useNdauWallet } from "../contexts/NdauWalletContext";

export interface NdauSignResult {
  signature: string;
  payload: string;
}

export interface UseNdauSignerReturn {
  requestSignature: (payloadBase64: string, walletAddress: string) => Promise<NdauSignResult>;
  isSigning: boolean;
  error: string | null;
  remainingSeconds: number;
}

const SIGN_TIMEOUT_MS = 30 * 60 * 1000;

export function useNdauSigner(): UseNdauSignerReturn {
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const { socket } = useNdauWallet();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const requestSignature = useCallback(
    (payloadBase64: string, walletAddress: string): Promise<NdauSignResult> => {
      console.log("[NDAU-SIGNER] requestSignature called", {
        socketExists: !!socket,
        socketId: socket?.id,
        walletAddress,
        payloadLength: payloadBase64?.length,
      });

      if (!socket || !socket.id) {
        const msg = "Socket not connected";
        console.error("[NDAU-SIGNER]", msg, { socket, socketId: socket?.id });
        setError(msg);
        return Promise.reject(new Error(msg));
      }

      setIsSigning(true);
      setError(null);
      startedAtRef.current = Date.now();
      setRemainingSeconds(Math.floor(SIGN_TIMEOUT_MS / 1000));

      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        const remaining = Math.max(0, Math.floor((SIGN_TIMEOUT_MS - elapsed) / 1000));
        setRemainingSeconds(remaining);
        if (remaining <= 0 && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, 1000);

      return new Promise<NdauSignResult>((resolve, reject) => {
        const cleanup = () => {
          socket.off("server-sign-fulfilled-website", handleFulfilled);
          socket.off("server-sign-rejected-website", handleRejected);
          socket.off("server-sign-failed-website", handleFailed);
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsSigning(false);
          setRemainingSeconds(0);
        };

        const handleFulfilled = (data: { signature: string; payload: string }) => {
          console.log("[NDAU-SIGNER] Received server-sign-fulfilled-website:", data);
          cleanup();
          if (data?.signature) {
            resolve({ signature: data.signature, payload: data.payload });
          } else {
            const msg = "Signature response missing signature data";
            setError(msg);
            reject(new Error(msg));
          }
        };

        const handleRejected = () => {
          console.log("[NDAU-SIGNER] Received server-sign-rejected-website");
          cleanup();
          const msg = "Signature request rejected by wallet";
          setError(msg);
          reject(new Error(msg));
        };

        const handleFailed = (data: { message: string }) => {
          console.log("[NDAU-SIGNER] Received server-sign-failed-website:", data);
          cleanup();
          const msg = data?.message || "Failed to sign with NDAU wallet";
          setError(msg);
          reject(new Error(msg));
        };

        socket.on("server-sign-fulfilled-website", handleFulfilled);
        socket.on("server-sign-rejected-website", handleRejected);
        socket.on("server-sign-failed-website", handleFailed);

        console.log("[NDAU-SIGNER] Emitting website-sign-request-server", {
          payload: payloadBase64,
          walletAddress,
        });

        socket.emit("website-sign-request-server", {
          payload: payloadBase64,
          walletAddress,
        });

        console.log("[NDAU-SIGNER] website-sign-request-server emitted, waiting for response...");

        timeoutRef.current = setTimeout(() => {
          console.log("[NDAU-SIGNER] Signature request timed out after", SIGN_TIMEOUT_MS, "ms");
          cleanup();
          const msg = "Signature request timed out";
          setError(msg);
          reject(new Error(msg));
        }, SIGN_TIMEOUT_MS);
      });
    },
    [socket]
  );

  return { requestSignature, isSigning, error, remainingSeconds };
}

export default useNdauSigner;

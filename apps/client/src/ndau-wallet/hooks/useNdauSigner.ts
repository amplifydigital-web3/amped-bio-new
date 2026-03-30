import { useState, useCallback } from "react";
import { useNdauWallet } from "../contexts/NdauWalletContext";
import type { SignResponse } from "../types/socketTypes";

export interface UseNdauSignerReturn {
  signData: (data: any, message?: string) => Promise<SignResponse | null>;
  isSigning: boolean;
  error: string | null;
}

export function useNdauSigner(): UseNdauSignerReturn {
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { socket, walletAddress } = useNdauWallet();

  const signData = useCallback(
    async (data: any, message?: string): Promise<SignResponse | null> => {
      if (!socket || !walletAddress) {
        setError("Wallet not connected");
        return null;
      }

      setIsSigning(true);
      setError(null);

      return new Promise((resolve) => {
        const requestId = Date.now().toString();

        const handleSignSuccess = (response: SignResponse) => {
          socket.off(`sign-success-${requestId}`, handleSignSuccess);
          socket.off(`sign-error-${requestId}`, handleSignError);
          setIsSigning(false);
          resolve(response);
        };

        const handleSignError = (errorData: { message: string }) => {
          socket.off(`sign-success-${requestId}`, handleSignSuccess);
          socket.off(`sign-error-${requestId}`, handleSignError);
          setIsSigning(false);
          setError(errorData.message || "Signing error");
          resolve(null);
        };

        socket.on(`sign-success-${requestId}`, handleSignSuccess);
        socket.on(`sign-error-${requestId}`, handleSignError);

        socket.emit("website-sign-request-server", {
          requestId,
          data,
          message,
          walletAddress,
          website_socket_id: socket.id,
        });

        setTimeout(() => {
          socket.off(`sign-success-${requestId}`, handleSignSuccess);
          socket.off(`sign-error-${requestId}`, handleSignError);
          setIsSigning(false);
          setError("Timeout: signature not completed");
          resolve(null);
        }, 60000);
      });
    },
    [socket, walletAddress]
  );

  return { signData, isSigning, error };
}

export default useNdauSigner;

import { TransactionOrVersionedTransaction, WalletInitializationError, Web3AuthError } from "@web3auth/no-modal";
import { useCallback, useState } from "react";

import { useSolanaWallet } from "./useSolanaWallet";

export type IUseSignAndSendTransaction = {
  loading: boolean;
  error: Web3AuthError | null;
  data: string | null;
  signAndSendTransaction: (transaction: TransactionOrVersionedTransaction) => Promise<string>;
};

export const useSignAndSendTransaction = (): IUseSignAndSendTransaction => {
  const { solanaWallet } = useSolanaWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Web3AuthError | null>(null);
  const [data, setData] = useState<string | null>(null);

  const signAndSendTransaction = useCallback(
    async (transaction: TransactionOrVersionedTransaction) => {
      setLoading(true);
      setError(null);
      try {
        if (!solanaWallet) throw WalletInitializationError.notReady();
        const signature = await solanaWallet.signAndSendTransaction(transaction);
        setData(signature);
        return signature;
      } catch (error) {
        setError(error as Web3AuthError);
      } finally {
        setLoading(false);
      }
    },
    [solanaWallet]
  );

  return { loading, error, data, signAndSendTransaction };
};

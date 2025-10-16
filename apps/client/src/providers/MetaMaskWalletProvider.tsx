import {
  ReactNode,
  useState,
  useEffect,
} from "react";
import { useBalance } from "wagmi";
import { WalletContext } from "../contexts/WalletContext";
import { useMetaMaskWallet } from "../hooks/useWallet";

export const MetaMaskWalletProvider = ({ children }: { children: ReactNode }) => {
  const wallet = useMetaMaskWallet();
  const [isUSD, setIsUSD] = useState(false);

  useEffect(() => {
    if (wallet.status !== "connected" && wallet.isReady) {
      wallet.connect();
    }
  }, [wallet.status, wallet.isReady, wallet.connect]);

  const balance = useBalance({
    address: wallet.address,
    query: { refetchInterval: 10000 },
  });

  const updateBalanceDelayed = () => {
    setTimeout(() => balance?.refetch(), 2000);
  };

  return (
    <WalletContext.Provider
      value={{
        connecting: wallet.status === "connecting",
        connect: wallet.connect,
        disconnect: wallet.disconnect,
        balance,
        isUSD,
        setIsUSD,
        updateBalanceDelayed,
        publicKey: null,
        address: wallet.address,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

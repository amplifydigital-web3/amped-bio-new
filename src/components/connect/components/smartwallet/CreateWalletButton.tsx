import { useCallback, useEffect } from "react";
import { CoinbaseWalletLogo } from "./CoinbaseWalletLogo";
import { BrandedProgrammeButton } from "../components/Buttons";
import { useAppKitWallet } from "@reown/appkit-wallet-button/react";
import { useAppKitAccount } from "@reown/appkit/react";

export function CreateWalletButton({
  handleSuccess,
  handleError,
}: {
  handleSuccess: (address: string) => void;
  handleError: (error: unknown) => void;
}) {
  const wallet = useAppKitWallet();
  const { address } = useAppKitAccount();

  const createWallet = useCallback(async () => {
    try {
      await wallet.connect("coinbase");
    } catch (error) {
      console.log("error.....", error);
      handleError(error);
    }
  }, [handleSuccess, handleError]);

  useEffect(() => {
    if (address) {
      handleSuccess(address);
    }
  }, [address, handleSuccess]);

  return (
    <BrandedProgrammeButton onClick={createWallet}>
      <CoinbaseWalletLogo />
      Connect Coinbase Smart Wallet
    </BrandedProgrammeButton>
  );
}

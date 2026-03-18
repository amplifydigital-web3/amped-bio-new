import { useEffect, useState } from "react";
import { useRNSNavigation } from "@/contexts/RNSNavigationContext";
import RegistrationSuccess from "@/components/rns/registration/success";

interface TransactionData {
  name: string;
  duration: number;
  ethPrice: string;
  usdPrice: string;
  timestamp: number;
  transactionHash: `0x${string}`;
}

export default function SuccessPage() {
  const { navigateToHome, navigateToProfile } = useRNSNavigation();
  const [transactionData, setTransactionData] = useState<TransactionData | null>(null);

  useEffect(() => {
    const storedData = localStorage.getItem("transactionData");

    if (!storedData) {
      navigateToHome();
      return;
    }

    try {
      setTransactionData(JSON.parse(storedData) as TransactionData);
    } catch (err) {
      console.error("Invalid transaction data", err);
      navigateToHome();
    }
  }, []); // ✅ EMPTY dependency array

  if (!transactionData) return null;

  return (
    <RegistrationSuccess
      name={transactionData.name}
      duration={transactionData.duration}
      ethPrice={transactionData.ethPrice}
      usdPrice={transactionData.usdPrice}
      txFeeEth="0.002"
      txFeeUsd="3.45"
      txHash={transactionData.transactionHash}
      onViewName={() => navigateToProfile(transactionData.name)}
      onRegisterAnother={navigateToHome}
    />
  );
}

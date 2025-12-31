import React, { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { useTransferOwnership } from "@/hooks/rns/useTransferOwnership";
import { useNameDetails } from "@/hooks/rns/useNameDetails";
import SearchStep from "./TransferSteps/SearchStep";
import FormStep from "./TransferSteps/FormStep";
import { WarningModal } from "./TransferSteps/WarningModal";
import TransactionProgressModal from "./TransferSteps/TransactionProgressStep";
import SuccessStep from "./TransferSteps/SuccessStep";
import { AddressResult } from "@/types/rns/common";

interface TransferNameModalProps {
  onClose: () => void;
  ensName?: string;
  expiryDate?: string;
}

type ModalStep = "search" | "form" | "warning" | "confirm" | "final";

const TransferNameModal: React.FC<TransferNameModalProps> = ({ onClose, ensName = "" }) => {
  const [step, setStep] = useState<ModalStep>("search");
  const [recipient, setRecipient] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<AddressResult | null>(null);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const { address } = useAccount();

  const domain = ensName?.split(".")[0] || "";
  const { ownerAddress, displayAddress, nftId } = useNameDetails(domain);

  const { transferOwnership, isConnected, steps, overallStatus } = useTransferOwnership();

  useEffect(() => {
    if (step === "confirm" && overallStatus === "success") {
      setStep("final");
    }
  }, [overallStatus, step]);

  const handleContinue = () => {
    if (!selectedAddress) return;

    if (ownerAddress && ownerAddress.toLowerCase() !== address?.toLowerCase()) {
      setNameError("You don't have permission to transfer this name.");
      return;
    }

    setNameError(null);
    setStep("form");
  };

  const handleTransfer = () => {
    if (!selectedAddress || !ensName) return;
    setStep("warning");
  };

  const handleWarningConfirm = async () => {
    if (!selectedAddress || !address || !nftId) return;

    setStep("confirm");

    try {
      await transferOwnership(domain, selectedAddress.address as `0x${string}`);
    } catch (error) {
      console.error("Transfer error:", error);
      // Optional: surface toast or inline error here
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full sm:max-w-lg shadow-lg flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {step === "search" && (
          <SearchStep
            onClose={onClose}
            recipient={recipient}
            setRecipient={setRecipient}
            selectedAddress={selectedAddress}
            setSelectedAddress={setSelectedAddress}
            ensName={ensName}
            ownerAddress={ownerAddress}
            address={address}
            isConnected={isConnected}
            handleContinue={handleContinue}
          />
        )}

        {step === "form" && (
          <FormStep
            onClose={onClose}
            goBack={() => setStep("search")}
            ensName={ensName}
            ownerAddress={ownerAddress}
            displayAddress={displayAddress}
            selectedAddress={selectedAddress}
            isConnected={isConnected}
            overallStatus={overallStatus}
            handleTransfer={handleTransfer}
            nameError={nameError}
          />
        )}

        {step === "warning" && (
          <WarningModal onClose={() => setStep("form")} onConfirm={handleWarningConfirm} />
        )}

        {step === "confirm" && (
          <TransactionProgressModal
            onClose={onClose}
            embedded
            overallStatus={overallStatus}
            steps={steps}
          />
        )}

        {step === "final" && (
          <SuccessStep
            onClose={onClose}
            ensName={ensName}
            selectedAddress={selectedAddress}
            steps={steps}
          />
        )}
      </div>
    </div>
  );
};

export default TransferNameModal;

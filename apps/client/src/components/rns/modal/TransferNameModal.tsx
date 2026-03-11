import React, { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { keccak256, toBytes } from "viem";

import { StepState } from "@/hooks/rns/useTransferOwnership";
import SearchStep from "./TransferSteps/SearchStep";
import FormStep from "./TransferSteps/FormStep";
import { WarningModal } from "./TransferSteps/WarningModal";
import TransactionProgressModal from "./TransferSteps/TransactionProgressStep";
import SuccessStep from "./TransferSteps/SuccessStep";
import { AddressResult, TxStatus, TxStep } from "@/types/rns/common";
import toast from "react-hot-toast";

interface TransferNameModalProps {
  onClose: () => void;
  ensName?: string;
  expiryDate?: string;
  ownerAddress: `0x${string}`;
  displayAddress: string;
  isConnected: boolean;
  overallStatus: TxStatus;
  steps: Record<TxStep, StepState>;
  transferOwnership: (name: string, receiverAddress: `0x${string}`) => Promise<unknown>;
  onSuccess?: (recipientAddress: `0x${string}`) => Promise<void> | void;
}

type ModalStep = "search" | "form" | "warning" | "confirm" | "final";

const TransferNameModal: React.FC<TransferNameModalProps> = ({
  onClose,
  ensName = "",
  ownerAddress,
  displayAddress,
  isConnected,
  overallStatus,
  steps,
  transferOwnership,
  onSuccess,
}) => {
  const [step, setStep] = useState<ModalStep>("search");
  const [recipient, setRecipient] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<AddressResult | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const { address } = useAccount();

  const domain = ensName?.split(".")[0] || "";
  // Compute nftId directly from domain — no need for a separate useNameDetails call
  const nftId = useMemo(() => (domain ? BigInt(keccak256(toBytes(domain))) : 0n), [domain]);

  useEffect(() => {
    if (step === "confirm" && overallStatus === "success") {
      setStep("final");
      toast.success("Name Successfully Transferred.");
      // Optimistically update ownership with the recipient address
      if (selectedAddress?.address) {
        onSuccess?.(selectedAddress.address as `0x${string}`);
      }
    }
  }, [overallStatus, step, onSuccess, selectedAddress]);

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

  const handleWarningConfirm = () => {
    if (!selectedAddress || !address || !nftId) return;

    setStep("confirm");
  };

  const confirmTransfer = async () => {
    if (!selectedAddress || !address || !nftId) return;
    try {
      await transferOwnership(domain, selectedAddress.address as `0x${string}`);
    } catch (error) {
      console.error("Transfer error:", error);
      toast.error("Transfer failed. Please try again.");
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
            onClose={() => setStep("warning")}
            embedded
            overallStatus={overallStatus}
            steps={steps}
            confirmTransfer={confirmTransfer}
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

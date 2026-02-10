import React from "react";
import { X, ExternalLink } from "lucide-react";
import { AddressResult, TxStep } from "@/types/rns/common";
import { scannerURL, trimmedDomainName } from "@/utils/rns";
import { StepState } from "@/hooks/rns/useTransferOwnership";

interface SuccessStepProps {
  onClose: () => void;
  ensName?: string;
  selectedAddress: AddressResult | null;
  steps: Record<TxStep, StepState>;
}

const SuccessStep: React.FC<SuccessStepProps> = ({ onClose, ensName, selectedAddress, steps }) => {
  const transferTxHash = steps.transfer?.hash;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e2e3e3] p-4 sm:p-6">
        <h2 className="text-xl font-semibold sm:text-2xl">Transfer complete</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-green-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <h3 className="mb-2 text-lg font-medium sm:text-xl">
            {trimmedDomainName(ensName || "")} has been transferred
          </h3>

          <p className="text-xs text-gray-600 sm:text-sm">
            The domain has been successfully transferred to{" "}
            <span className="font-medium">{selectedAddress?.name || selectedAddress?.address}</span>
            .
          </p>

          {transferTxHash && (
            <a
              href={scannerURL("tx", transferTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center text-blue-500 hover:underline"
            >
              View transaction
              <ExternalLink className="ml-1 h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-[#e2e3e3] p-4 sm:p-6">
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default SuccessStep;

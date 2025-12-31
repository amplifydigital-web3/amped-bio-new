import React from "react";
import { X, AlertTriangle } from "lucide-react";
import { Address } from "viem";

import { AddressResult, TxStatus } from "@/types/rns/common";
import { trimmedDomainName } from "@/utils/rns";

interface FormStepProps {
  onClose: () => void;
  goBack: () => void;
  ensName?: string;
  displayAddress?: string;
  ownerAddress?: Address;
  selectedAddress: AddressResult | null;
  isConnected: boolean;
  overallStatus: TxStatus;
  handleTransfer: () => void;
  nameError: string | null;
}

const FormStep: React.FC<FormStepProps> = ({
  onClose,
  goBack,
  ensName,
  displayAddress,
  ownerAddress,
  selectedAddress,
  isConnected,
  overallStatus,
  handleTransfer,
  nameError,
}) => {
  const senderAddress = ownerAddress || displayAddress;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-center p-3 sm:p-5 border-b border-[#e2e3e3]">
        <button onClick={goBack} className="text-blue-500">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M19 12H5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 19L5 12L12 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button onClick={onClose} className="text-gray-500">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5">
        <h1 className="text-lg sm:text-2xl font-bold mb-3">You&apos;ll be sending</h1>

        {/* Name Card */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4 flex items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100" />
            <div>
              <p className="font-semibold">{ensName ? trimmedDomainName(ensName) : "—"}</p>
              {senderAddress && (
                <>
                  <p className="block lg:hidden text-gray-500 text-sm">
                    {senderAddress.slice(0, 6)}…{senderAddress.slice(-4)}
                  </p>
                  <p className="hidden lg:block text-gray-500 text-sm">{senderAddress}</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Recipient */}
        <h2 className="text-lg sm:text-2xl font-bold mb-2">To</h2>

        {selectedAddress && (
          <div className="bg-gray-50 rounded-xl p-3 mb-4 flex items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full" />
              <div className="text-sm sm:text-base">
                {selectedAddress.name && <p className="font-medium">{selectedAddress.name}</p>}
                <>
                  <p
                    className={`block lg:hidden text-sm ${
                      selectedAddress.name ? "text-gray-500" : "font-medium"
                    }`}
                  >
                    {selectedAddress.address.slice(0, 6)}…{selectedAddress.address.slice(-4)}
                  </p>
                  <p
                    className={`hidden lg:block text-sm ${
                      selectedAddress.name ? "text-gray-500" : "font-medium"
                    }`}
                  >
                    {selectedAddress.address}
                  </p>
                </>
              </div>
            </div>
          </div>
        )}

        {/* What will be sent */}
        <h2 className="text-lg sm:text-2xl font-bold mb-2">What you&apos;ll send</h2>

        <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-3">
          <InfoItem
            title="Address record"
            description="Your Revoname will resolve to this address."
          />
          <InfoItem
            title="Name record"
            description="Your Revoname will no longer be displayed with your address."
          />
          <InfoItem
            title="Profile editing"
            description="Transfer editing rights to this address."
          />
          <InfoItem
            title="Token ownership"
            description="Transfer the Revoname token to this address."
          />
        </div>

        {/* Error */}
        {nameError && (
          <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Error</span>
            </div>
            <p className="mt-1 text-sm">{nameError}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 sm:p-5 border-t border-[#e2e3e3]">
        <button
          onClick={handleTransfer}
          disabled={!isConnected || overallStatus === "pending"}
          className="w-full bg-blue-500 text-white py-2.5 px-6 rounded-xl font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

const InfoItem = ({ title, description }: { title: string; description: string }) => (
  <div>
    <p className="font-semibold text-sm">{title}</p>
    <p className="text-gray-500 text-xs sm:text-sm">{description}</p>
  </div>
);

export default FormStep;

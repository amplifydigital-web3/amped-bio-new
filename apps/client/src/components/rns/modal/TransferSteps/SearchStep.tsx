import React, { useMemo } from "react";
import { X, Search, AlertTriangle } from "lucide-react";
import { isAddress } from "viem";

import { useReverseLookup } from "@/hooks/rns/useReverseLookup";
import { AddressResult } from "@/types/rns/common";

interface SearchStepProps {
  onClose: () => void;
  recipient: string;
  setRecipient: (value: string) => void;
  selectedAddress: AddressResult | null;
  setSelectedAddress: (address: AddressResult | null) => void;
  ensName?: string;
  ownerAddress?: `0x${string}`;
  address?: `0x${string}`;
  isConnected: boolean;
  handleContinue: () => void;
}

const SearchStep: React.FC<SearchStepProps> = ({
  onClose,
  recipient,
  setRecipient,
  selectedAddress,
  setSelectedAddress,
  ensName,
  ownerAddress,
  address,
  isConnected,
  handleContinue,
}) => {
  const { fullName: recipientEnsName } = useReverseLookup(recipient as `0x${string}`);

  const isOwner = ownerAddress && address && ownerAddress.toLowerCase() === address.toLowerCase();

  const isSelfTransfer =
    Boolean(selectedAddress) &&
    Boolean(address) &&
    selectedAddress?.address.toLowerCase() === address?.toLowerCase();

  const showInvalidAddress = recipient.trim() !== "" && !selectedAddress;

  const handleSearch = (value: string) => {
    setRecipient(value);

    if (!value.trim()) {
      setSelectedAddress(null);
      return;
    }

    if (isAddress(value)) {
      setSelectedAddress({
        address: value as `0x${string}`,
        name: recipientEnsName,
      });
      return;
    }

    setSelectedAddress(null);
  };

  return (
    <div className="flex flex-col rounded-3xl">
      {/* Header */}
      <div className="flex justify-between items-center p-4 sm:p-6 border-b border-[#e2e3e3]">
        <h2 className="text-xl sm:text-2xl font-semibold">Send Name</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Search input */}
        <div className="relative mb-8">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Ethereum address"
            className="w-full text-sm sm:text-base pl-10 pr-4 py-2 rounded-lg border border-[#e2e3e3] focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={recipient}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        {/* Invalid address */}
        {showInvalidAddress && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg text-gray-600 text-center">
            Please enter a valid Ethereum address
          </div>
        )}

        {/* Empty state */}
        {!selectedAddress && !recipient.trim() && (
          <div className="flex items-center justify-center flex-col text-gray-500 gap-2 mt-8">
            <Search className="w-8 h-8 text-gray-400 mb-2" />
            <p className="text-center">
              Enter an Ethereum address
              <br />
              to transfer this name to
            </p>
          </div>
        )}

        {/* Selected address */}
        {selectedAddress && (
          <div className="flex items-center gap-3 py-2 px-2 sm:p-3 border border-[#e2e3e3] rounded-lg mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-300 to-blue-400" />
            <div className="flex-1 min-w-0">
              {selectedAddress.name && <div>{selectedAddress.name}</div>}
              <div className="text-sm sm:text-base text-gray-500 truncate font-semibold">
                {selectedAddress.address}
              </div>
            </div>
          </div>
        )}

        {/* Warnings */}
        {!isConnected && (
          <Warning
            title="Wallet not connected"
            message="Connect your wallet to transfer your domain."
          />
        )}

        {!ensName && (
          <Warning
            title="Name not found"
            message={`The name ${ensName} could not be found or is not registered.`}
          />
        )}

        {!isOwner && ownerAddress && (
          <Warning
            title="Not the owner"
            message="You don't have permission to transfer this name."
          />
        )}

        {isSelfTransfer && (
          <Warning
            title="Invalid recipient"
            message="You cannot transfer a name to your own address."
          />
        )}
      </div>

      {/* Footer */}
      <div className="p-4 sm:p-6 border-t border-[#e2e3e3]">
        <div className="flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600"
          >
            Cancel
          </button>

          {selectedAddress && (
            <button
              onClick={handleContinue}
              disabled={!isConnected || !isOwner || isSelfTransfer}
              className={`flex-1 py-2 px-4 rounded-lg ${
                isConnected && isOwner && !isSelfTransfer
                  ? "bg-blue-500 hover:bg-blue-600 text-white"
                  : "bg-blue-200 text-white cursor-not-allowed"
              }`}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                               Warning UI                                   */
/* -------------------------------------------------------------------------- */

const Warning = ({ title, message }: { title: string; message: string }) => (
  <div className="mt-2 p-3 bg-yellow-50 text-yellow-700 rounded-lg">
    <div className="flex items-center gap-2">
      <AlertTriangle className="w-5 h-5" />
      <span className="font-medium">{title}</span>
    </div>
    <p className="mt-1 text-sm">{message}</p>
  </div>
);

export default SearchStep;

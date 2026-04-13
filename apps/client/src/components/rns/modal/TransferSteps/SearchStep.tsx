import React, { useState, useEffect } from "react";
import { X, Search, AlertTriangle } from "lucide-react";
import { isAddress, zeroAddress } from "viem";
import { useResolveRevoName } from "@/hooks/rns/useResolveRevoName";
import { DOMAIN_SUFFIX } from "@/config/rns/constants";

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
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [debouncedRnsName, setDebouncedRnsName] = useState("");
  const [showRnsResult, setShowRnsResult] = useState(false);

  // Debounce recipient input for RNS resolution
  useEffect(() => {
    if (recipient && !isAddress(recipient) && recipient.endsWith(DOMAIN_SUFFIX)) {
      const timer = setTimeout(() => setDebouncedRnsName(recipient), 700);
      return () => clearTimeout(timer);
    } else {
      setDebouncedRnsName("");
      setShowRnsResult(false);
    }
  }, [recipient]);

  const {
    address: resolvedAddress,
    isLoading: resolving,
    error: resolveHookError,
  } = useResolveRevoName(debouncedRnsName);

  useEffect(() => {
    if (debouncedRnsName && (resolvedAddress || resolveHookError)) {
      setShowRnsResult(true);
    }
  }, [debouncedRnsName, resolvedAddress, resolveHookError]);

  const isOwner = ownerAddress && address && ownerAddress.toLowerCase() === address.toLowerCase();

  const isSelfTransfer =
    Boolean(selectedAddress) &&
    Boolean(address) &&
    selectedAddress?.address.toLowerCase() === address?.toLowerCase();

  const showInvalidAddress =
    recipient.trim() !== "" && !selectedAddress && !resolveError && !resolving;

  const handleSearch = (value: string) => {
    setRecipient(value);
    setResolveError(null);

    if (!value.trim()) {
      setSelectedAddress(null);
      return;
    }

    if (isAddress(value)) {
      if (value === zeroAddress) {
        setResolveError("Zero address is not allowed as recipient.");
        setSelectedAddress(null);
        return;
      }
      setSelectedAddress({
        address: value as `0x${string}`,
        name: recipientEnsName,
      });
      return;
    }

    // Do not set address here for RNS, let useEffect handle it
    setSelectedAddress(null);
  };

  // Ensure resolved RNS address is set after resolution completes
  useEffect(() => {
    if (debouncedRnsName && showRnsResult && resolvedAddress && isAddress(resolvedAddress)) {
      if (resolvedAddress === zeroAddress) {
        setResolveError("Revoname not found or invalid.");
        setSelectedAddress(null);
        return;
      }
      if (!selectedAddress || selectedAddress.address !== resolvedAddress) {
        setResolveError(null);
        setSelectedAddress({
          address: resolvedAddress,
          name: debouncedRnsName,
        });
      }
    }
    // If resolution failed
    else if (debouncedRnsName && showRnsResult && resolveHookError) {
      setResolveError("Revoname not found or invalid.");
      setSelectedAddress(null);
    }
  }, [debouncedRnsName, showRnsResult, resolvedAddress, resolveHookError, selectedAddress]);

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
            placeholder="Ethereum address or Revoname"
            className="w-full text-sm sm:text-base pl-10 pr-10 py-2 rounded-lg border border-[#e2e3e3] focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={recipient}
            onChange={e => handleSearch(e.target.value)}
            disabled={resolving}
          />
          {recipient && (
            <button
              type="button"
              className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 focus:outline-none"
              onClick={() => handleSearch("")}
              aria-label="Clear input"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Invalid address or Revoname */}
        {showInvalidAddress && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg text-gray-600 text-center">
            Please enter a valid Ethereum address or Revoname
          </div>
        )}
        {resolveError && (
          <div className="mb-4 p-3 bg-red-50 rounded-lg text-red-600 text-center">
            {resolveError}
          </div>
        )}
        {resolving && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg text-blue-600 text-center">
            Resolving Revoname...
          </div>
        )}

        {/* Empty state */}
        {!selectedAddress && !recipient.trim() && (
          <div className="flex items-center justify-center flex-col text-gray-500 gap-2 mt-8">
            <Search className="w-8 h-8 text-gray-400 mb-2" />
            <p className="text-center">
              Enter an Ethereum address or Revoname
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

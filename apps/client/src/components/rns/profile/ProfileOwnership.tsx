import { useState } from "react";
import {
  HelpCircle,
  Send,
  FastForward,
  RefreshCcw,
  Copy,
  Loader,
  ExternalLink,
} from "lucide-react";
import TransferNameModal from "@/components/rns/modal/TransferNameModal";
import ExtendRegistrationModal from "@/components/rns/modal/ExtendRegistrationModal";
import { formatDateTime, nftIdToBytes32, scannerURL, trimmedDomainName } from "@/utils/rns";
import { Address } from "viem";
import { NameDates } from "@/types/rns/name";
import { useTransferOwnership } from "@/hooks/rns/useTransferOwnership";
import { useChainId } from "wagmi";
import { getChainConfig } from "@ampedbio/web3";

interface OwnershipDetailsProps {
  name: string;
  ownerAddress: Address;
  displayAddress: string;
  transactionHash: `0x${string}`;
  dates: NameDates;
  isCurrentOwner: boolean;
  allowWalletActions?: boolean;
  datesLoading?: boolean;
  refetchOwnership?: () => Promise<void>;
  refetchDates?: () => Promise<void>;
  optimisticSetOwner?: (newOwner: `0x${string}`) => void;
  optimisticExtendExpiry?: (addedDurationSeconds: bigint) => void;
  nftId: bigint;
  resolver: `0x${string}` | undefined;
}

const OwnershipDetail = ({
  name,
  ownerAddress,
  displayAddress,
  transactionHash,
  dates,
  isCurrentOwner,
  allowWalletActions = true,
  datesLoading = false,
  refetchOwnership,
  refetchDates,
  optimisticSetOwner,
  optimisticExtendExpiry,
  nftId,
  resolver,
}: OwnershipDetailsProps) => {
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isExtRegModalOpen, setIsExtRegModalOpen] = useState(false);
  const canRefresh = allowWalletActions && (Boolean(refetchDates) || Boolean(refetchOwnership));

  const hexData = nftIdToBytes32(nftId);
  const chainId = useChainId();
  const networkConfig = getChainConfig(chainId);

  const { overallStatus, steps, transferOwnership, isConnected } = useTransferOwnership();

  const handleRefresh = async () => {
    if (!canRefresh) return;

    await Promise.allSettled([refetchOwnership?.(), refetchDates?.()]);
  };

  return (
    <div className="w-full max-w-4xl mx-auto sm:px-6 lg:px-8">
      <div className="w-full max-w-4xl mx-auto sm:px-6 lg:px-8 space-y-4 border border-[#e2e3e3] rounded-xl bg-gray-50 shadow-sm py-8">
        <div className="bg-white rounded-xl shadow-sm border border-[#e2e3e3]">
          <div className="p-5 sm:p-6">
            <div className="flex justify-between items-center mb-4 sm:mb-5">
              <h2 className="text-2xl font-bold">Roles</h2>
              <span className="text-blue-500 text-xs font-bold bg-blue-50 p-1 rounded-2xl">
                1 address
              </span>
            </div>

            <div className="border-y border-[#e2e3e3] py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-500 flex-shrink-0 overflow-hidden" />
                  <div>
                    {/*<div className="font-medium">{details.name}</div>*/}
                    <div className="flex items-center font-semibold gap-2">
                      <span title={ownerAddress} className="font-bold">
                        {displayAddress}
                      </span>
                      <Copy
                        className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-pointer"
                        onClick={() => navigator.clipboard.writeText(ownerAddress)}
                      />
                    </div>
                  </div>
                </div>

                {/* Desktop view - horizontal row */}
                <div className="items-center gap-4 hidden sm:flex">
                  <button className="px-4 py-1 border-2 border-gray-200 hover:bg-gray-200 text-sm text-blue-600 font-bold">
                    Owner
                  </button>

                  <button className="px-4 py-1 border-2 border-gray-200 hover:bg-gray-200 text-sm text-blue-600 font-bold">
                    ETH record
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-row gap-2 sm:hidden mt-4">
              <button className="px-4 py-1 border-2 border-gray-200 hover:bg-gray-200 text-sm text-blue-600 font-bold w-full">
                Owner
              </button>

              <button className="px-4 py-1 border-2 border-gray-200 hover:bg-gray-200 text-sm text-blue-600 font-bold w-full">
                ETH record
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-6">
              {isCurrentOwner && (
                <button
                  disabled={overallStatus === "pending"}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 w-full sm:w-auto min-w-10 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setIsTransferModalOpen(true)}
                >
                  {overallStatus === "pending" ? (
                    <>
                      <Loader className="animate-spin" />
                      <span title="Name is being transferred">Transferring</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Transfer
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Dates Section */}
        <div className="bg-white rounded-xl shadow-sm border mt-4 border-[#e2e3e3] relative">
          <div className="p-5 sm:p-6 space-y-4">
            {/* Refresh Button with Scoped Loading */}
            {canRefresh && (
              <button
                type="button"
                className="absolute right-5 top-5 cursor-pointer hover:opacity-70 transition-opacity"
                onClick={handleRefresh}
                title="Refresh details"
              >
                <RefreshCcw className={`w-4 h-4 ${datesLoading ? "animate-spin" : ""}`} />
              </button>
            )}

            {/* Loading Overlay for Scoped Dates Refresh */}
            {canRefresh && datesLoading && (
              <div className="absolute inset-0 bg-white/40 rounded-xl flex items-center justify-center z-10">
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                  <span className="text-xs text-gray-600">Updating...</span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 md:pb-2 md:border-b-2 md:border-gray-100">
              <div className="md:border-r-2 md:border-gray-100 md:p-2 ">
                <h3 className="text-base font-bold mb-1">Name expires</h3>
                <div className="text-base font-semibold">{dates.expiry.date}</div>
                <div className="text-gray-500 text-sm">{dates.expiry.time}</div>
              </div>
              <div className="md:border-r-2 md:border-gray-100 md:p-2">
                <div className="flex items-center gap-1">
                  <h3 className="text-base font-bold mb-1">Grace period ends</h3>
                  <HelpCircle className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-base font-semibold">{dates.gracePeriod.date}</div>
                <div className="text-gray-500 text-sm">{dates.gracePeriod.time}</div>
              </div>
              <div className="md:border-r-2 md:border-transparent md:p-2">
                <div className="flex items-center gap-1">
                  <h3 className="text-base font-bold mb-1">Registered</h3>
                  {transactionHash && (
                    <a
                      href={scannerURL("tx", `${transactionHash}`)}
                      target="_blank"
                      className="text-blue-500 hover:text-blue-600 flex items-center gap-1"
                    >
                      View
                    </a>
                  )}
                </div>
                <div className="text-base font-semibold">
                  {dates.registration.date == "Invalid DateTime"
                    ? formatDateTime(Date.now()).date
                    : dates.registration.date}
                </div>
                <div className="text-gray-500 text-sm">
                  {dates.registration.time == "Invalid DateTime"
                    ? formatDateTime(Date.now()).time
                    : dates.registration.time}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 mt-6 pb-6">
              {isCurrentOwner && (
                <button
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 text-sm"
                  onClick={() => setIsExtRegModalOpen(true)}
                >
                  <FastForward className="w-4 h-4" />
                  Extend
                </button>
              )}
            </div>
            {/* <div className="flex gap-2 bg-white font-bold rounded-xl shadow-sm border mt-4 border-[#e2e3e3] p-4 text-sm sm:text-base text-gray-600">
            <Info />
            Information may take sometime to update.
          </div> */}
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto sm:px-6 lg:px-8 space-y-4 border border-[#e2e3e3] rounded-xl bg-gray-50 shadow-sm py-8 mt-4">
        {/* Token Card */}
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-[#e2e3e3]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold mb-0">Token</h2>
            <a
              href={scannerURL(
                "nft",
                `${networkConfig?.contracts.BASE_REGISTRAR.address}/${nftId}`
              )}
              target="_blank"
              className="text-blue-500 hover:text-blue-600 flex items-center gap-1 font-medium"
            >
              Explorer <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-6">
            <div className="space-y-4">
              {/* Hex Value */}
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-4 break-all">
                  <span className="text-gray-500 font-semibold w-32 mb-2 sm:mb-0">hex</span>
                  <span className="text-sm pr-2 font-semibold">{hexData}</span>
                  <Copy
                    onClick={() => navigator.clipboard.writeText(hexData)}
                    className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer ml-2 flex-shrink-0"
                  />
                </div>
              </div>

              {/* Decimal Value */}
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-4 break-all">
                  <span className="text-gray-500 font-semibold w-40 mb-2 sm:mb-0">decimal</span>
                  <p className="text-sm pr-2 font-semibold">{nftId.toString()}</p>
                  <Copy
                    onClick={() => navigator.clipboard.writeText(String(nftId))}
                    className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer ml-2 flex-shrink-0"
                  />
                </div>
              </div>
            </div>

            {/* ENS Logo Box */}
            <div className="w-full max-w-xs bg-blue-500 rounded-lg flex flex-col items-center justify-center text-white p-2 mx-0 sm:mx-auto sm:p-4">
              <div className="mb-2">
                <svg
                  viewBox="0 0 24 24"
                  className="w-6 h-6 sm:w-8 sm:h-8"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="text-xs sm:text-sm">{trimmedDomainName(name)}</span>
            </div>
          </div>
        </div>
        {/* Resolver Card */}
        <div className="bg-white rounded-2xl shadow-sm p-6  border border-[#e2e3e3]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold mb-0">Resolver</h2>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 sm:gap-0">
              <span className="break-all font-semibold">{resolver}</span>
              <Copy
                onClick={() => navigator.clipboard.writeText(resolver as string)}
                className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {isTransferModalOpen && (
        <TransferNameModal
          onClose={() => {
            setIsTransferModalOpen(false);
          }}
          ensName={name}
          expiryDate={dates.expiry.date}
          ownerAddress={ownerAddress}
          displayAddress={displayAddress}
          isConnected={isConnected}
          overallStatus={overallStatus}
          steps={steps}
          transferOwnership={transferOwnership}
          onSuccess={async (recipientAddress: `0x${string}`) => {
            optimisticSetOwner?.(recipientAddress);
          }}
        />
      )}

      {isExtRegModalOpen && (
        <ExtendRegistrationModal
          isOpen={isExtRegModalOpen}
          onClose={() => {
            setIsExtRegModalOpen(false);
          }}
          onSuccess={(addedDurationSeconds: bigint) => {
            optimisticExtendExpiry?.(addedDurationSeconds);
          }}
          ensName={name}
          currentExpiryDate={dates.expiry.timestamp}
        />
      )}
    </div>
  );
};

export default OwnershipDetail;

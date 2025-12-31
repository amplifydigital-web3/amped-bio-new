import { useState } from "react";
import { HelpCircle, Send, FastForward, RefreshCcw, Copy, Info } from "lucide-react";
import TransferNameModal from "@/components/rns/modal/TransferNameModal";
import ExtendRegistrationModal from "@/components/rns/modal/ExtendRegistrationModal";
import { formatDateTime, scannerURL } from "@/utils/rns";
import { Address } from "viem";
import { NameDates } from "@/types/rns/name";

interface OwnershipDetailsProps {
  name: string;
  ownerAddress: Address;
  displayAddress: string;
  transactionHash: `0x${string}`;
  dates: NameDates;
  isCurrentOwner: boolean;
  isNameDetailsLoading: boolean;
  refetchNameDetails: () => void;
}

const OwnershipDetail = ({
  name,
  ownerAddress,
  displayAddress,
  transactionHash,
  dates,
  isCurrentOwner,
  isNameDetailsLoading,
  refetchNameDetails,
}: OwnershipDetailsProps) => {
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isExtRegModalOpen, setIsExtRegModalOpen] = useState(false);

  const handleRefetch = async () => {
    refetchNameDetails();
  };

  return (
    <div className="w-full max-w-4xl mx-auto sm:px-6 lg:px-8">
      {/* Roles Section */}
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
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 w-full sm:w-auto"
                onClick={() => setIsTransferModalOpen(true)}
              >
                <Send className="w-4 h-4" />
                Transfer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dates Section */}
      <div className="bg-white rounded-xl shadow-sm border mt-4 border-[#e2e3e3] relative">
        <div className="p-5 sm:p-6 space-y-4">
          <div className="absolute right-5 cursor-pointer" onClick={handleRefetch}>
            <RefreshCcw className={`w-4 h-4 mr-2 ${isNameDetailsLoading ? "animate-spin" : ""}`} />
          </div>
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

      {isTransferModalOpen && (
        <TransferNameModal
          onClose={() => {
            setIsTransferModalOpen(false);
          }}
          ensName={name}
          expiryDate={dates.expiry.date}
        />
      )}

      {isExtRegModalOpen && (
        <ExtendRegistrationModal
          isOpen={isExtRegModalOpen}
          onClose={() => {
            setIsExtRegModalOpen(false);
          }}
          onSuccess={async () => {
            setIsExtRegModalOpen(false);
            handleRefetch();
          }}
          ensName={name}
          currentExpiryDate={dates.expiry.timestamp}
        />
      )}
    </div>
  );
};

export default OwnershipDetail;

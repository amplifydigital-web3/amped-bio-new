import { useState } from "react";
import { useParams } from "react-router";
import { domainName, scannerURL, trimmedDomainName } from "@/utils/rns";
import { Copy, ExternalLink } from "lucide-react";
import { useAccount } from "wagmi";
import { ProfileCard } from "@/components/rns/profile/ProfileCard";
import { ProfileNav } from "@/components/rns/profile/ProfileNav";
import MoreDetails from "@/components/rns/profile/MoreDetail";
import OwnershipDetail from "@/components/rns/profile/ProfileOwnership";
import { useNameDetails } from "@/hooks/rns/useNameDetails";

export function PublicRNSProfilePage() {
  const { rnsName } = useParams();
  const [activeTab, setActiveTab] = useState<"details" | "ownership" | "more">("details");

  const handleTabChange = (tab: "details" | "ownership" | "more") => {
    setActiveTab(tab);
  };

  const {
    displayAddress,
    ownerAddress,
    dates,
    transactionHash,
    isCurrentOwner,
    nftId,
    resolver,
    isLoading,
    refetchDates,
    refetchOwnership,
    datesLoading,
  } = useNameDetails(rnsName || "");
  const { address: connectedWallet } = useAccount();

  if (!rnsName) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">RNS Name not provided</h1>
          <p className="text-gray-600 mt-2">Please provide a valid RNS name in the URL.</p>
        </div>
      </div>
    );
  }

  if (isLoading || !ownerAddress) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin h-16 w-16 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="my-2 sm:my-10 max-w-[840px] w-full mx-auto px-3 sm:px-6">
      <div className="px-6 py-2 flex items-center justify-between">
        <div className="flex items-center justify-center gap-4">
          <h1 className="text-sm sm:text-3xl font-bold hidden sm:flex">
            {trimmedDomainName(rnsName)}
          </h1>
          <Copy
            className="w-4 h-4 text-gray-400 cursor-pointer hidden sm:flex"
            onClick={() => navigator.clipboard.writeText(domainName(rnsName))}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between px-5 gap-1">
        <ProfileNav
          name={rnsName}
          activeTab={activeTab}
          connectedWallet={connectedWallet}
          addressFull={ownerAddress}
          onTabChange={handleTabChange}
        />

        {ownerAddress && (
          <a
            href={scannerURL("address", ownerAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 flex items-center gap-1 font-bold"
          >
            <ExternalLink className="w-3 h-3" />
            Explorer
          </a>
        )}
      </div>

      {activeTab === "details" && (
        <ProfileCard
          name={rnsName}
          addressFull={ownerAddress}
          addressFormatted={displayAddress}
          expiry={dates.expiry.date}
          registrant={ownerAddress}
          onTabChange={handleTabChange}
        />
      )}
      {activeTab === "ownership" && (
        <OwnershipDetail
          name={rnsName}
          dates={dates}
          displayAddress={displayAddress}
          ownerAddress={ownerAddress}
          transactionHash={transactionHash}
          isCurrentOwner={isCurrentOwner}
          allowWalletActions={false}
          datesLoading={datesLoading}
          refetchDates={refetchDates}
          refetchOwnership={refetchOwnership}
        />
      )}
      {activeTab === "more" && <MoreDetails name={rnsName} nftId={nftId} resolver={resolver} />}
    </div>
  );
}

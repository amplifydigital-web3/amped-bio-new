import { useEffect, useState } from "react";
import { domainName, scannerURL } from "@/utils/rns";
import { Copy, ExternalLink } from "lucide-react";
import { useAccount } from "wagmi";
import { useRNSNavigation } from "@/contexts/RNSNavigationContext";
import { ProfileCard } from "@/components/rns/profile/ProfileCard";
import { ProfileNav } from "@/components/rns/profile/ProfileNav";
import OwnershipDetail from "@/components/rns/profile/ProfileOwnership";
import { useNameDetails } from "@/hooks/rns/useNameDetails";
import VerificationDetail from "@/components/rns/verification/VerificationDetails";

interface ProfilePageProps {
  name: string;
}

export default function ProfilePage({ name }: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState<"details" | "ownership" | "identity">("details");

  const handleTabChange = (tab: "details" | "ownership" | "identity") => {
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
    refetchOwnership,
    refetchDates,
    isLoading,
    datesLoading,
    isNameAvailable,
    optimisticSetOwner,
    optimisticExtendExpiry,
  } = useNameDetails(name);
  const { address: connectedWallet } = useAccount();
  const { navigateToHome, navigateToRegister } = useRNSNavigation();

  const [redirecting, setRedirecting] = useState(false);

  const isDifferentOwner =
    connectedWallet && ownerAddress && connectedWallet.toLowerCase() !== ownerAddress.toLowerCase();

  /**
   * ✅ Redirect handled correctly
   */
  useEffect(() => {
    if (!isLoading && isNameAvailable === true) {
      setRedirecting(true);
      navigateToRegister(name);
    }
  }, [isLoading, isNameAvailable, navigateToRegister, name]);

  /**
   * ✅ Block render while redirecting
   */
  // Prevent initial content flash: block render until availability is known
  if (isLoading || redirecting || isNameAvailable === undefined) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin h-16 w-16 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="my-2 sm:my-10 max-w-[840px] w-full mx-auto px-3 sm:px-6">
      <div className="px-6 py-2 flex flex-col gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold break-all min-w-0">{domainName(name)}</h1>
          <Copy
            className="w-4 h-4 text-gray-400 cursor-pointer shrink-0 mt-1.5 sm:mt-2"
            onClick={() => navigator.clipboard.writeText(domainName(name))}
          />
        </div>

        {isDifferentOwner && (
          <div className="cursor-pointer self-end shrink-0" onClick={navigateToHome}>
            <span className="text-blue-600 font-bold hover:underline hover:text-blue-500">
              Register your own REVO Name
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between px-5 gap-1">
        <ProfileNav name={name} activeTab={activeTab} onTabChange={handleTabChange} />

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
          name={name}
          addressFull={ownerAddress}
          addressFormatted={displayAddress}
          expiry={dates.expiry.date}
          registrant={ownerAddress}
          onTabChange={handleTabChange}
        />
      )}
      {activeTab === "ownership" && (
        <OwnershipDetail
          name={name}
          dates={dates}
          displayAddress={displayAddress}
          ownerAddress={ownerAddress}
          transactionHash={transactionHash}
          isCurrentOwner={isCurrentOwner}
          datesLoading={datesLoading}
          refetchOwnership={refetchOwnership}
          refetchDates={refetchDates}
          optimisticSetOwner={optimisticSetOwner}
          optimisticExtendExpiry={optimisticExtendExpiry}
          nftId={nftId}
          resolver={resolver}
        />
      )}
      {activeTab === "identity" && <VerificationDetail />}
    </div>
  );
}
